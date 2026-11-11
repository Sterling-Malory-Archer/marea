#!/usr/bin/env bash
# Restore a backup into a database — for disaster recovery and for the regular restore drill.
#
#   TARGET_DATABASE_URL=mysql://user:pass@host:3306/marea_restore scripts/restore-db.sh backups/marea-….sql.gz
#
# Safety: verifies the checksum, refuses to write into a database that already has tables
# unless --replace is given, and asks you to type the database name before replacing.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/db-url.sh
file="${1:?Usage: restore-db.sh <backup.sql.gz> [--replace]}"
replace="${2:-}"
: "${TARGET_DATABASE_URL:?Set TARGET_DATABASE_URL (the database to restore INTO)}"
[[ -f "$file" ]] || { echo "No such file: $file" >&2; exit 1; }
if [[ -f "$file.sha256" ]]; then
  (cd "$(dirname "$file")" && sha256sum -c --quiet "$(basename "$file").sha256") || { echo "Checksum mismatch — backup is damaged" >&2; exit 1; }
  echo "Checksum OK"
fi
mysql_options_file "$TARGET_DATABASE_URL"
trap 'rm -f "$MYSQL_OPTS_FILE"' EXIT

mysql --defaults-extra-file="$MYSQL_OPTS_FILE" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci" 2>/dev/null || true
tables=$(mysql --defaults-extra-file="$MYSQL_OPTS_FILE" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME'")
if [[ "$tables" != "0" ]]; then
  [[ "$replace" == "--replace" ]] || { echo "$DB_NAME already has $tables tables. Re-run with --replace to overwrite it." >&2; exit 1; }
  if [[ -z "${RESTORE_CONFIRM:-}" ]]; then
    read -r -p "This REPLACES every table in '$DB_NAME'. Type the database name to continue: " answer
  else
    answer="$RESTORE_CONFIRM"
  fi
  [[ "$answer" == "$DB_NAME" ]] || { echo "Cancelled." >&2; exit 1; }
fi

echo "Restoring $file → $DB_NAME"
gunzip -c "$file" | mysql --defaults-extra-file="$MYSQL_OPTS_FILE" "$DB_NAME"
echo "Restored. Row counts:"
mysql --defaults-extra-file="$MYSQL_OPTS_FILE" -N -e "
  SELECT 'orders', COUNT(*) FROM \`$DB_NAME\`.orders UNION ALL
  SELECT 'products', COUNT(*) FROM \`$DB_NAME\`.products UNION ALL
  SELECT 'users', COUNT(*) FROM \`$DB_NAME\`.users UNION ALL
  SELECT 'migrations', COUNT(*) FROM \`$DB_NAME\`._prisma_migrations"
