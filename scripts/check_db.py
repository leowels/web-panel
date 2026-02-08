import asyncio
import os
import ssl

import asyncpg


def _get_env(name: str, default: str | None = None) -> str | None:
    return os.getenv(name, default)


def _build_conn_params():
    host = _get_env("POSTGRESQL_HOST")
    port = int(_get_env("POSTGRESQL_PORT", "5432"))
    user = _get_env("POSTGRESQL_USER")
    password = _get_env("POSTGRESQL_PASSWORD")
    dbname = _get_env("POSTGRESQL_DBNAME")

    if not host or not user or not password or not dbname:
        raise RuntimeError("Missing required env vars: POSTGRESQL_HOST/USER/PASSWORD/DBNAME")

    ssl_required = _get_env("POSTGRESQL_SSL", "true").lower() == "true"
    ssl_ctx = None
    if ssl_required:
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE

    return {
        "host": host,
        "port": port,
        "user": user,
        "password": password,
        "database": dbname,
        "ssl": ssl_ctx,
    }


async def main() -> int:
    try:
        params = _build_conn_params()
        print(f"Connecting to {params['host']}:{params['port']} db={params['database']} user={params['user']} ssl={'on' if params['ssl'] else 'off'}")
        conn = await asyncpg.connect(**params)
        try:
            val = await conn.fetchval("select 1")
            print(f"OK: select 1 -> {val}")
        finally:
            await conn.close()
        return 0
    except Exception as e:
        print(f"ERROR: {e}")
        return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
