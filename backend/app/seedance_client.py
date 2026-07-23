from typing import Any

import httpx

from .config import settings


class SeedanceAPIError(Exception):
    def __init__(self, status_code: int, detail: Any):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Seedance API error ({status_code}): {detail}")


class SeedanceClient:
    """Thin wrapper around the BytePlus ModelArk Seedance video generation REST API.

    Docs: https://docs.byteplus.com/en/docs/ModelArk/2291680
    """

    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        self.api_key = api_key or settings.ark_api_key
        self.base_url = (base_url or settings.ark_base_url).rstrip("/")

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise SeedanceAPIError(500, "ARK_API_KEY is not configured on the server.")
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def create_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.base_url}/contents/generations/tasks"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, headers=self._headers(), json=payload)
        if resp.status_code >= 400:
            raise SeedanceAPIError(resp.status_code, resp.text)
        return resp.json()

    async def get_task(self, task_id: str) -> dict[str, Any]:
        url = f"{self.base_url}/contents/generations/tasks/{task_id}"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, headers=self._headers())
        if resp.status_code >= 400:
            raise SeedanceAPIError(resp.status_code, resp.text)
        return resp.json()


seedance_client = SeedanceClient()
