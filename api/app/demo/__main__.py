"""python -m app.demo [seed|reseed|delete]"""

import asyncio
import logging
import sys

from sqlalchemy import select

from app.db import SessionLocal
from app.demo import runner
from app.models import Project


async def main(command: str) -> None:
    if command == "seed":
        print("seeded" if await runner.seed() else "demo already exists (use reseed to rebuild)")
    elif command == "reseed":
        await runner.seed(force=True)
        print("reseeded")
    elif command == "delete":
        async with SessionLocal() as db:
            await runner._delete_demo(db)
            await db.commit()
            print("deleted" if not await db.scalar(select(Project).where(Project.is_demo)) else "?")
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "seed"))
