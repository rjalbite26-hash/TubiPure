#!/bin/sh
set -eu

PORT="${PORT:-10000}"
export APP_URL="${APP_URL:-${RENDER_EXTERNAL_URL:-http://localhost:${PORT}}}"

if [ -n "${RENDER_EXTERNAL_URL:-}" ]; then
  export APP_ENV=production
  export APP_DEBUG=false
  export SESSION_DRIVER=file
  export CACHE_STORE=file

  if [ "${DB_CONNECTION:-}" = "sqlite" ]; then
    export DB_DATABASE=/var/www/html/storage/app/database.sqlite
  fi
fi

sed -ri "s/Listen 80/Listen ${PORT}/" /etc/apache2/ports.conf
sed -ri "s/<VirtualHost \\*:80>/<VirtualHost *:${PORT}>/" /etc/apache2/sites-available/000-default.conf

php artisan storage:link --force
php artisan migrate --force

if [ "${DB_CONNECTION:-}" = "sqlite" ]; then
  SQLITE_DATABASE="${DB_DATABASE:-/var/www/html/storage/app/database.sqlite}"
  chown www-data:www-data "$SQLITE_DATABASE"
  chmod 664 "$SQLITE_DATABASE"
fi

php artisan optimize

exec apache2-foreground
