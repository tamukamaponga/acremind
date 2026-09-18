# AcreMind demonstration deployment

This private repository contains the complete application source in acremind-source.tar.gz. Extract it to inspect or edit the PHP, JavaScript, images and documentation. Docker extracts the same source when building.

Render Blueprint: render.yaml. Both web and PostgreSQL plans are explicitly free. The free database expires after 30 days; export important demo records before expiry. The web service sleeps after inactivity, but records remain in PostgreSQL while that database exists. Sessions may require signing in again after the web server restarts.

Set GEMINI_API_KEY privately for AI. Set APP_URL to the deployed HTTPS address. Password recovery on Render requires an HTTPS mail-delivery webhook; free Render blocks Gmail SMTP. Do not claim email delivery works before configuring and testing that service.

No local database, sessions, saved credentials or real farm data are in this repository. Claim the Owner account before sharing the website. PostgreSQL deployment must be verified after the first build.
