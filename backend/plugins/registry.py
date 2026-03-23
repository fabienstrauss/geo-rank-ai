from __future__ import annotations

from importlib.metadata import entry_points

from fastapi import HTTPException

from plugins.base import ScraperPluginDefinition
from plugins.builtin import BUILTIN_SCRAPER_PLUGINS


ENTRYPOINT_GROUP = "georank.scrapers"


def _load_entrypoint_plugins() -> list[ScraperPluginDefinition]:
    plugins: list[ScraperPluginDefinition] = []
    for entry_point in entry_points().select(group=ENTRYPOINT_GROUP):
        loaded = entry_point.load()
        plugin = loaded() if callable(loaded) and not isinstance(loaded, ScraperPluginDefinition) else loaded
        if not isinstance(plugin, ScraperPluginDefinition):
            raise RuntimeError(f"Entry point '{entry_point.name}' did not return a ScraperPluginDefinition")
        plugins.append(plugin)
    return plugins


def list_scraper_plugins() -> list[ScraperPluginDefinition]:
    discovered = {plugin.key: plugin for plugin in BUILTIN_SCRAPER_PLUGINS}
    for plugin in _load_entrypoint_plugins():
        discovered[plugin.key] = plugin
    return sorted(discovered.values(), key=lambda plugin: plugin.name.lower())


def get_scraper_plugin(key: str) -> ScraperPluginDefinition:
    for plugin in list_scraper_plugins():
        if plugin.key == key:
            return plugin
    raise HTTPException(status_code=404, detail="Scraper plugin not found")


def build_scraper_runner(key: str):
    plugin = get_scraper_plugin(key)
    if plugin.runner_cls is None:
        raise HTTPException(status_code=501, detail="Scraper plugin does not provide a runtime implementation")
    return plugin.runner_cls()
