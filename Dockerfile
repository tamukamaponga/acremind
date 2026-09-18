FROM php:8.4-apache
RUN apt-get update && apt-get install -y --no-install-recommends libsqlite3-dev libcurl4-openssl-dev libpq-dev && docker-php-ext-install pdo_mysql pdo_sqlite pdo_pgsql curl && rm -rf /var/lib/apt/lists/*
ADD acremind-source.tar.gz /var/www/html/
RUN cp /var/www/html/deploy/apache.conf /etc/apache2/sites-available/000-default.conf && mkdir -p /var/www/html/storage && chown -R www-data:www-data /var/www/html/storage && chmod 700 /var/www/html/storage
ENV FFMS_STORAGE=/var/www/html/storage
EXPOSE 80
