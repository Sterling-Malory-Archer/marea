# shellcheck shell=bash
# Turns a mysql:// URL into a private client options file, so passwords never appear
# in the process list or shell history. Sourced by backup-db.sh and restore-db.sh.
mysql_options_file() {
  local url="$1" re='^mysql://([^:@/]+)(:([^@]*))?@([^:/?]+)(:([0-9]+))?/([^?]+)(\?(.*))?$'
  [[ "$url" =~ $re ]] || { echo "Not a mysql:// URL" >&2; return 1; }
  local user="${BASH_REMATCH[1]}" pass="${BASH_REMATCH[3]}" host="${BASH_REMATCH[4]}" port="${BASH_REMATCH[6]:-3306}" query="${BASH_REMATCH[9]}"
  DB_NAME="${BASH_REMATCH[7]}"
  # URL-decode the user name and password (%40 → @ etc.).
  user=$(printf '%b' "${user//%/\\x}"); pass=$(printf '%b' "${pass//%/\\x}")
  local f; f=$(mktemp); chmod 600 "$f"
  {
    echo "[client]"
    echo "user=$user"
    echo "password=\"${pass//\"/\\\"}\""
    echo "host=$host"
    echo "port=$port"
    echo "default-character-set=utf8mb4"
    [[ "$query" == *ssl=true* || "$query" == *sslaccept=strict* ]] && echo "ssl-mode=REQUIRED"
  } > "$f"
  MYSQL_OPTS_FILE="$f"
}
