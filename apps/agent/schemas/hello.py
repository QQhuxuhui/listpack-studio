"""Hello-world contract mirrors of `packages/shared-schemas/src/hello.ts`.

D3 placeholder — deleted once real listing-pack contracts land.
"""

from pydantic import BaseModel, Field


class HelloRequest(BaseModel):
    message: str = Field(min_length=1, max_length=500)


class HelloResponse(BaseModel):
    message: str
    plan: list[str]
    response: str
