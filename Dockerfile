# Candle Obsession: production image (ASP.NET Core 10 + SQLite + Vite/React islands)
#
#   docker build -t candle-obsession .
#   docker run -p 8080:8080 -v candle-data:/data --env-file .env candle-obsession
#
# Stage 1 builds the front-end (ClientApp -> wwwroot/dist), stage 2 publishes the .NET app,
# stage 3 is the small runtime image. The SQLite database and data-protection keys live in /data,
# so mount a persistent disk/volume there (Render: disk mounted at /data, see render.yaml).
# NOTE: written without Docker available locally, so this file has not been built yet (see HOSTING.md).

# ---------- 1. Front-end ----------
FROM node:22-alpine AS client
WORKDIR /src/ClientApp
# Playwright is a dev dependency (used for e2e tests only); never download browsers in the image.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY ClientApp/package.json ClientApp/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY ClientApp/ ./
# vite.config.ts writes to ../wwwroot/dist, i.e. /src/wwwroot/dist
RUN npm run build

# ---------- 2. .NET publish ----------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Candle_Obsession.csproj ./
RUN dotnet restore Candle_Obsession.csproj
COPY . ./
# The built front-end must be in wwwroot/dist BEFORE publish so it is included as a static asset.
COPY --from=client /src/wwwroot/dist ./wwwroot/dist
# SkipClientBuild: the front-end was already built in stage 1 (no Node in this image).
RUN dotnet publish Candle_Obsession.csproj -c Release -o /app/publish --no-restore -p:SkipClientBuild=true -p:UseAppHost=false

# ---------- 3. Runtime ----------
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_HTTP_PORTS=8080 \
    ConnectionStrings__DefaultConnection="Data Source=/data/candleobsession.db" \
    Catalog__Path=/data/products.json \
    Catalog__ImagesPath=/data/product-images

# /data holds the SQLite database (candleobsession.db), data-protection keys (/data/keys), and what the admin
# product editor saves: the catalogue (/data/products.json, first copied from Data/products.json) and
# uploaded photos (/data/product-images).
# It must be writable by the non-root "app" user that the official image provides ($APP_UID).
RUN mkdir -p /data && chown "$APP_UID" /data

COPY --from=build /app/publish ./

USER $APP_UID
EXPOSE 8080

# No HEALTHCHECK here: the aspnet image has no curl/wget. Hosts check GET /healthz themselves
# (Render: healthCheckPath in render.yaml).
ENTRYPOINT ["dotnet", "Candle_Obsession.dll"]
