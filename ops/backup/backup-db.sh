#!/usr/bin/env bash

set -o pipefail
umask 077

# ================= Configuration =================

# C3-B target layout. These source templates MUST NOT be installed until
# the separately approved C4 atomic data/runtime cutover.
PROJECT_ROOT="/opt/sanq/runtime"
BACKUP_DIR="/srv/sanq/backups"
UPLOADS_DIR="/srv/sanq/uploads"
ENV_FILE="$PROJECT_ROOT/.env"

RCLONE_REMOTE="gdrive_backup"
RCLONE_SECURE_REMOTE="gdrive_secure"

REMOTE_ROOT="sanqin-backups"
REMOTE_DB_DAILY="$REMOTE_ROOT/database-daily"
REMOTE_DB_MONTHLY="$REMOTE_ROOT/database-monthly"
REMOTE_UPLOADS_CURRENT="$REMOTE_ROOT/uploads-current"
REMOTE_UPLOADS_HISTORY="$REMOTE_ROOT/uploads-history"

# MessagingSend long-term archive remains independent.
REMOTE_ARCHIVE_FOLDER="sanqin-archives/messaging"

# The privileged helper is the only root escalation in this job. It validates
# and uploads the Nginx/SSL archive itself so the root-only TLS key is never
# made readable by the ubuntu service account.
PROTECTED_NGINX_HELPER="/usr/local/sbin/sanq-backup-protected-nginx"

BACKUP_FAILED=0

# Fail closed before making any local archive, changing remote mirror state,
# or running retention cleanup. C4 provisions the fixed directories first.
# Root-owned ancestor paths prevent ubuntu from replacing the backup directory
# itself while the privileged helper runs. Avoid symlink traversal.
verify_trusted_parent() {
    local path="$1"
    local uid mode
    if [ ! -d "$path" ] || [ -L "$path" ]; then
        echo "❌ Unsafe or missing trusted directory: $path" >&2
        exit 1
    fi
    uid="$(stat -c '%u' -- "$path")" || exit 1
    mode="$(stat -c '%a' -- "$path")" || exit 1
    if [ "$uid" != "0" ] || (( (8#$mode & 0022) != 0 )); then
        echo "❌ Trusted directory ownership/mode mismatch: $path" >&2
        exit 1
    fi
}

verify_data_dir() {
    local path="$1" expected_uid="$2" uid mode
    if [ ! -d "$path" ] || [ -L "$path" ]; then
        echo "❌ Missing or unsafe data directory: $path" >&2
        exit 1
    fi
    uid="$(stat -c '%u' -- "$path")" || exit 1
    mode="$(stat -c '%a' -- "$path")" || exit 1
    if [ "$uid" != "$expected_uid" ] || (( (8#$mode & 0077) != 0 )); then
        echo "❌ Unsafe data directory ownership/mode: $path" >&2
        exit 1
    fi
}

verify_trusted_parent /opt
verify_trusted_parent /opt/sanq
verify_trusted_parent /srv
verify_trusted_parent /srv/sanq
verify_trusted_parent "$PROJECT_ROOT"
verify_data_dir "$BACKUP_DIR" "$(id -u)"
# Uploaded files may be container-created as root, but must stay in one
# non-symlinked directory with no group/world write access.
if [ ! -d "$UPLOADS_DIR" ] || [ -L "$UPLOADS_DIR" ]; then
    echo "❌ Missing or unsafe uploads directory" >&2
    exit 1
fi
uploads_mode="$(stat -c '%a' -- "$UPLOADS_DIR")" || exit 1
if (( (8#$uploads_mode & 0022) != 0 )); then
    echo "❌ Uploads directory is group/world writable" >&2
    exit 1
fi
if [ ! -f "$ENV_FILE" ] || [ -L "$ENV_FILE" ]; then
    echo "❌ Missing or unsafe runtime .env" >&2
    exit 1
fi
env_mode="$(stat -c '%a' -- "$ENV_FILE")" || exit 1
if (( (8#$env_mode & 0077) != 0 )); then
    echo "❌ Runtime .env has group/world access" >&2
    exit 1
fi

# This non-secret marker is created root:root 0644 ONLY after C4 has
# completed the independent uploads/backup and Compose-volume reconciliation.
# A copied-but-not-activated target directory must NEVER drive rclone sync.
LAYOUT_ACTIVATION_MARKER="/opt/sanq/runtime/.sanq-backup-layout-activated"
if [ ! -f "$LAYOUT_ACTIVATION_MARKER" ] || [ -L "$LAYOUT_ACTIVATION_MARKER" ]; then
    echo "❌ C4 backup layout has not been activated" >&2
    exit 1
fi
marker_uid="$(stat -c '%u' -- "$LAYOUT_ACTIVATION_MARKER")" || exit 1
marker_mode="$(stat -c '%a' -- "$LAYOUT_ACTIVATION_MARKER")" || exit 1
if [ "$marker_uid" != "0" ] || (( (8#$marker_mode & 0022) != 0 )) ||
   [ "$(cat -- "$LAYOUT_ACTIVATION_MARKER")" != "SANQ_BACKUP_LAYOUT_C4_V1" ]; then
    echo "❌ C4 backup activation marker is invalid" >&2
    exit 1
fi

# Prevent a newly installed main script from silently using an old helper
# pointed at the legacy backup root. C4 must verify the pair before activation.
if [ ! -f "$PROTECTED_NGINX_HELPER" ] || [ -L "$PROTECTED_NGINX_HELPER" ] ||
   ! grep -Fxq 'BACKUP_DIR="/srv/sanq/backups"' "$PROTECTED_NGINX_HELPER"; then
    echo "❌ Protected Nginx helper is missing or still targets the old backup root" >&2
    exit 1
fi
helper_uid="$(stat -c '%u' -- "$PROTECTED_NGINX_HELPER")" || exit 1
helper_mode="$(stat -c '%a' -- "$PROTECTED_NGINX_HELPER")" || exit 1
if [ "$helper_uid" != "0" ] || (( (8#$helper_mode & 0022) != 0 )); then
    echo "❌ Protected helper ownership/mode mismatch" >&2
    exit 1
fi

mark_failure() {
    BACKUP_FAILED=1
    echo "❌ $*"
}

# ================= Safe .env reader =================
#
# Do not source .env. Passwords can contain shell metacharacters.
#

read_env_value() {
    local key="$1"
    local value
    local first
    local last

    value="$(
        awk -v key="$key" '
            index($0, key "=") == 1 {
                sub("^[^=]*=", "")
                sub(/\r$/, "")
                print
                exit
            }
        ' "$ENV_FILE"
    )"

    if [ "${#value}" -ge 2 ]; then
        first="${value:0:1}"
        last="${value: -1}"

        if { [ "$first" = '"' ] && [ "$last" = '"' ]; } ||
           { [ "$first" = "'" ] && [ "$last" = "'" ]; }; then
            value="${value:1:${#value}-2}"
        fi
    fi

    printf '%s' "$value"
}

if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: missing configuration file $ENV_FILE"
    exit 1
fi

DB_USER="$(read_env_value DB_USER)"
DB_PASSWORD="$(read_env_value DB_PASSWORD)"

if [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ]; then
    echo "❌ Error: unable to read DB_USER / DB_PASSWORD from .env"
    exit 1
fi

# ================= Time and filenames =================

DATE=$(date +%Y%m%d_%H%M%S)
MONTH=$(date +%Y-%m)

DB_FILENAME="sanqin_db_$DATE.sql.gz"
DB_MONTHLY_FILENAME="sanqin_db_$MONTH.sql.gz"
CONF_FILENAME="sanqin_config_$DATE.tar.gz"
NGINX_FILENAME="sanqin_nginx_$DATE.tar.gz"

DB_FILEPATH="$BACKUP_DIR/$DB_FILENAME"
CONF_FILEPATH="$BACKUP_DIR/$CONF_FILENAME"

# Never create BACKUP_DIR on demand: an empty/misbound target could
# invalidate retention and uploads-history guarantees.
echo "[$(date)] ========== Starting SanQ backup =========="

# ================= Database container =================

CONTAINER_ID=$(docker ps -qf "name=db" | head -n 1)

if [ -z "$CONTAINER_ID" ]; then
    echo "❌ Error: database container not found"
    exit 1
fi

# ==================================================
# Task 0: MessagingSend daily incremental archive
# ==================================================

echo "🗄️  Exporting new MessagingSend rows..."

TARGET_DATE=$(date -d "yesterday" +%Y-%m-%d)
MONTH_DIR=$(date -d "yesterday" +%Y-%m)

MSG_FILENAME="MessagingSends_${TARGET_DATE}.jsonl"
MSG_LOCAL_PATH="/tmp/$MSG_FILENAME"

if docker exec \
    -e PGPASSWORD="$DB_PASSWORD" \
    "$CONTAINER_ID" \
    psql -U "$DB_USER" -d sanqin_db -c \
    "COPY (
        SELECT row_to_json(t)
        FROM (
            SELECT *
            FROM \"MessagingSend\"
            WHERE \"createdAt\"::date = '${TARGET_DATE}'
        ) t
    ) TO STDOUT" > "$MSG_LOCAL_PATH"
then
    if [ -s "$MSG_LOCAL_PATH" ]; then
        if rclone copy \
            "$MSG_LOCAL_PATH" \
            "$RCLONE_REMOTE:$REMOTE_ARCHIVE_FOLDER/$MONTH_DIR"
        then
            echo "✅ MessagingSend archive uploaded: ${TARGET_DATE}"
        else
            mark_failure "MessagingSend upload failed: ${TARGET_DATE}"
        fi
    else
        echo "ℹ️  No MessagingSend rows to archive for ${TARGET_DATE}"
    fi
else
    mark_failure "MessagingSend export failed: ${TARGET_DATE}"
fi

rm -f "$MSG_LOCAL_PATH"

# ==================================================
# Task 1: full database backup
#
# Daily   = retain 30 days
# Monthly = overwrite current-month snapshot, retain 7 years
# ==================================================

echo "🗄️  Exporting full database..."

if docker exec \
    -e PGPASSWORD="$DB_PASSWORD" \
    "$CONTAINER_ID" \
    pg_dump -U "$DB_USER" sanqin_db |
    gzip > "$DB_FILEPATH"
then
    if [ -s "$DB_FILEPATH" ] && gzip -t "$DB_FILEPATH"; then
        echo "✅ Database export passed gzip integrity"

        if rclone copy \
            "$DB_FILEPATH" \
            "$RCLONE_REMOTE:$REMOTE_DB_DAILY"
        then
            echo "✅ Daily database backup uploaded"
        else
            mark_failure "Daily database backup upload failed"
        fi

        if rclone copyto \
            "$DB_FILEPATH" \
            "$RCLONE_REMOTE:$REMOTE_DB_MONTHLY/$DB_MONTHLY_FILENAME"
        then
            echo "✅ Monthly database snapshot updated: $DB_MONTHLY_FILENAME"
        else
            mark_failure "Monthly database snapshot upload failed"
        fi
    else
        mark_failure "Database backup integrity check failed"
        rm -f "$DB_FILEPATH"
    fi
else
    mark_failure "Database export failed"
    rm -f "$DB_FILEPATH"
fi

# ==================================================
# Task 2: project configuration
# ==================================================

echo "⚙️  Packaging project configuration..."

if tar \
    -czf "$CONF_FILEPATH" \
    -C "$PROJECT_ROOT" \
    .env docker-compose.yml
then
    if [ -s "$CONF_FILEPATH" ] &&
       gzip -t "$CONF_FILEPATH" &&
       tar -tzf "$CONF_FILEPATH" .env docker-compose.yml >/dev/null 2>&1
    then
        if rclone copy \
            "$CONF_FILEPATH" \
            "$RCLONE_SECURE_REMOTE:config"
        then
            echo "✅ Project configuration backup uploaded"
        else
            mark_failure "Project configuration upload failed"
        fi
    else
        mark_failure "Project configuration archive validation failed"
        rm -f "$CONF_FILEPATH"
    fi
else
    mark_failure "Project configuration packaging failed"
    rm -f "$CONF_FILEPATH"
fi

# ==================================================
# Task 3: protected Nginx / SSL configuration
# ==================================================

echo "🚦 Packaging protected Nginx / SSL configuration..."

if sudo -n "$PROTECTED_NGINX_HELPER" "$NGINX_FILENAME"; then
    echo "✅ Nginx / SSL protected backup uploaded"
else
    mark_failure "Nginx / SSL protected backup failed"
fi

# ==================================================
# Task 4: uploads incremental mirror
#
# uploads-current:
#   exact mirror of current server uploads.
#
# uploads-history:
#   --backup-dir receives remote-current objects that are replaced/deleted by
#   this sync. Files created and removed entirely between two sync runs were
#   never present remotely and therefore do not appear in uploads-history.
# ==================================================

if [ -d "$UPLOADS_DIR" ]; then
    if find "$UPLOADS_DIR" -type f -print -quit | grep -q .; then
        echo "🖼️  Syncing uploads incrementally..."

        if rclone sync \
            "$UPLOADS_DIR" \
            "$RCLONE_REMOTE:$REMOTE_UPLOADS_CURRENT" \
            --backup-dir \
            "$RCLONE_REMOTE:$REMOTE_UPLOADS_HISTORY/$DATE"
        then
            echo "✅ uploads-current sync succeeded"
        else
            mark_failure "uploads-current sync failed"
        fi
    else
        mark_failure "uploads directory is empty; sync skipped to avoid remote deletion"
    fi
else
    mark_failure "uploads directory is missing; sync skipped"
fi

# ==================================================
# Task 5: lifecycle cleanup
# ==================================================

echo "🧹 Cleaning local backups older than 7 days..."

if ! find "$BACKUP_DIR" \
    -type f \
    \( \
        -name "sanqin_db_*.sql.gz" \
        -o -name "sanqin_config_*.tar.gz" \
        -o -name "sanqin_nginx_*.tar.gz" \
        -o -name "sanqin_uploads_*.tar.gz" \
    \) \
    -mtime +7 \
    -delete
then
    mark_failure "Local backup cleanup failed"
fi

echo "☁️  Cleaning Daily database backups older than 30 days..."
if ! rclone delete \
    "$RCLONE_REMOTE:$REMOTE_DB_DAILY" \
    --min-age 30d
then
    mark_failure "Daily database retention cleanup failed"
fi

echo "☁️  Cleaning project configuration backups older than 30 days..."
if ! rclone delete \
    "$RCLONE_SECURE_REMOTE:config" \
    --min-age 30d
then
    mark_failure "Project configuration retention cleanup failed"
fi

echo "☁️  Cleaning Nginx configuration backups older than 30 days..."
if ! rclone delete \
    "$RCLONE_SECURE_REMOTE:nginx" \
    --min-age 30d
then
    mark_failure "Nginx configuration retention cleanup failed"
fi

echo "☁️  Cleaning uploads history older than 30 days..."
history_parent_listing=""
if history_parent_listing="$(rclone lsf "$RCLONE_REMOTE:$REMOTE_ROOT" --dirs-only 2>/dev/null)"; then
    if printf '%s\n' "$history_parent_listing" | grep -Fxq "uploads-history/"; then
        if ! rclone delete \
            "$RCLONE_REMOTE:$REMOTE_UPLOADS_HISTORY" \
            --min-age 30d
        then
            mark_failure "uploads-history retention cleanup failed"
        fi

        if ! rclone rmdirs \
            "$RCLONE_REMOTE:$REMOTE_UPLOADS_HISTORY" \
            --leave-root
        then
            mark_failure "uploads-history empty-directory cleanup failed"
        fi
    else
        echo "ℹ️  uploads-history does not exist yet; nothing to clean"
    fi
else
    mark_failure "Unable to inspect backup remote for uploads-history retention cleanup"
fi

echo "☁️  Cleaning Monthly database snapshots older than 7 years..."
if ! rclone delete \
    "$RCLONE_REMOTE:$REMOTE_DB_MONTHLY" \
    --min-age 7y
then
    mark_failure "Monthly database retention cleanup failed"
fi

if [ "$BACKUP_FAILED" -ne 0 ]; then
    echo "[$(date)] ========== SanQ backup completed WITH FAILURES =========="
    exit 1
fi

echo "[$(date)] ========== SanQ backup completed successfully =========="
