#!/usr/bin/env bash
# Consistent MySQL backup (no locks on InnoDB tables), compressed and checksummed.
#
#   DATABASE_URL=mysql://user:pass@host:3306/marea scripts/backup-db.sh
#
# Optional:
#   BACKUP_DIR=./backups            where to keep local copies (default ./backups)
#   BACKUP_KEEP_DAYS=14             delete local copies older than this
#   BACKUP_S3_URI=s3://bucket/db    also upload (needs the AWS CLI; works with any S3-compatible storage)
#   BACKUP_S3_ENDPOINT=https://…    endpoint for non-AWS storage
#
# Schedule daily (e.g. cron: 30 2 * * *). Keep off-site copies with a bucket lifecycle rule
# (e.g. 30 daily + 12 monthly). Test a restore regularly — see docs/LAUNCH.md.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/db-url.sh
: "${DATABASE_URL:?Set DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
mysql_options_file "$DATABASE_URL"
trap 'rm -f "$MYSQL_OPTS_FILE"' EXIT

stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="$BACKUP_DIR/marea-$DB_NAME-$stamp.sql.gz"
gtid=""
mysqldump --help 2>/dev/null | grep -q -- "--set-gtid-purged" && gtid="--set-gtid-purged=OFF"

echo "Backing up $DB_NAME → $file"
# shellcheck disable=SC2086
mysqldump --defaults-extra-file="$MYSQL_OPTS_FILE" \
  --single-transaction --quick --routines --triggers --events --hex-blob --no-tablespaces $gtid \
  "$DB_NAME" | gzip -9 > "$file.partial"
mv "$file.partial" "$file"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$file")" > "$(basename "$file").sha256")
echo "  $(du -h "$file" | cut -f1), sha256 $(cut -c1-16 "$file.sha256")…"

if [[ -n "${BACKUP_S3_URI:-}" ]]; then
  endpoint=(); [[ -n "${BACKUP_S3_ENDPOINT:-}" ]] && endpoint=(--endpoint-url "$BACKUP_S3_ENDPOINT")
  aws s3 cp "${endpoint[@]}" --only-show-errors "$file" "$BACKUP_S3_URI/"
  aws s3 cp "${endpoint[@]}" --only-show-errors "$file.sha256" "$BACKUP_S3_URI/"
  echo "  uploaded to $BACKUP_S3_URI/"
fi

find "$BACKUP_DIR" -name 'marea-*.sql.gz*' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
echo "Done."
