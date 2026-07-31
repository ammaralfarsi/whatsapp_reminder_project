"""Async client for the WhatsApp Reminder app API."""

from typing import Any

from aiohttp import ClientError, ClientSession


class ReminderApiError(Exception):
    """Raised when the app API cannot satisfy a request."""


class ReminderApi:
    """Client scoped to one app user."""

    def __init__(self, session: ClientSession, base_url: str, api_key: str) -> None:
        self._session = session
        self._base_url = base_url.rstrip("/")
        self._headers = {"X-Api-Key": api_key}

    async def _request(self, method: str, path: str, payload=None) -> Any:
        try:
            async with self._session.request(
                method,
                f"{self._base_url}{path}",
                headers=self._headers,
                json=payload,
                timeout=20,
            ) as response:
                response.raise_for_status()
                return None if response.status == 204 else await response.json()
        except (ClientError, TimeoutError, ValueError) as err:
            raise ReminderApiError(str(err)) from err

    async def validate(self):
        return await self._request("GET", "/api/me")

    async def snapshot(self):
        return {
            "reminders": await self._request("GET", "/api/reminders"),
            "numbers": await self._request("GET", "/api/numbers"),
        }

    async def create_reminder(self, payload: dict[str, Any]):
        return await self._request("POST", "/api/reminders", payload)

    async def send_now(self, reminder_id: str):
        return await self._request("POST", f"/api/reminders/{reminder_id}/send-now")
