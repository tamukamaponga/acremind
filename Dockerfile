FROM php:8.4-apache
RUN apt-get update && apt-get install -y --no-install-recommends libsqlite3-dev libcurl4-openssl-dev && docker-php-ext-install pdo_mysql pdo_sqlite curl && rm -rf /var/lib/apt/lists/*
COPY public /var/www/html/public
COPY src /var/www/html/src
COPY scripts /var/www/html/scripts
RUN printf '%s\n' '<VirtualHost *:80>' '    DocumentRoot /var/www/html/public' '    <Directory /var/www/html/public>' '        Options -Indexes' '        AllowOverride None' '        Require all granted' '        DirectoryIndex index.php' '    </Directory>' '</VirtualHost>' > /etc/apache2/sites-available/000-default.conf && mkdir -p /var/www/html/storage && chown -R www-data:www-data /var/www/html/storage && chmod 700 /var/www/html/storage
ENV FFMS_STORAGE=/var/www/html/storage
EXPOSE 80
