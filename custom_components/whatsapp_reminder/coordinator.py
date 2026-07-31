"""Polling coordinator."""

import logging
from datetime import timedelta

from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import ReminderApiError
from .const import DOMAIN


class ReminderCoordinator(DataUpdateCoordinator):
    """Poll the local reminder app."""

    def __init__(self, hass, api) -> None:
        super().__init__(
            hass,
            logger=logging.getLogger(__name__),
            name=DOMAIN,
            update_interval=timedelta(seconds=30),
        )
        self.api = api

    async def _async_update_data(self):
        try:
            return await self.api.snapshot()
        except ReminderApiError as err:
            raise UpdateFailed(str(err)) from err
