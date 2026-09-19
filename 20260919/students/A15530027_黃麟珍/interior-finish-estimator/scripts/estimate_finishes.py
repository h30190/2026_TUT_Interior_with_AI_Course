#!/usr/bin/env python3
"""Calculate early-stage quantities for common interior finish materials."""

from __future__ import annotations

import argparse
import json
import math
from typing import Any


def positive(value: str) -> float:
    number = float(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("must be greater than 0")
    return number


def nonnegative(value: str) -> float:
    number = float(value)
    if number < 0:
        raise argparse.ArgumentTypeError("must be 0 or greater")
    return number


def waste_percent(value: str) -> float:
    number = float(value)
    if not 0 <= number <= 100:
        raise argparse.ArgumentTypeError("must be between 0 and 100")
    return number


def money(quantity: int, unit_price: float | None) -> dict[str, float]:
    if unit_price is None:
        return {}
    return {"unit_price": round(unit_price, 2), "material_subtotal": round(quantity * unit_price, 2)}


def estimate_paint(args: argparse.Namespace) -> dict[str, Any]:
    wall_area = 2 * (args.length + args.width) * args.height
    ceiling_area = args.length * args.width if args.ceiling else 0.0
    gross_area = wall_area + ceiling_area
    net_area = gross_area - args.openings_area
    if net_area <= 0:
        raise ValueError("openings area must be smaller than the gross paint area")

    base_liters = net_area * args.coats / args.coverage
    required_liters = base_liters * (1 + args.waste_percent / 100)
    containers = math.ceil(required_liters / args.container_liters)

    return {
        "material": "paint",
        "inputs": {
            "room_m": {"length": args.length, "width": args.width, "height": args.height},
            "openings_area_m2": args.openings_area,
            "include_ceiling": args.ceiling,
            "coats": args.coats,
            "coverage_m2_per_liter": args.coverage,
            "waste_percent": args.waste_percent,
            "container_liters": args.container_liters,
        },
        "calculations": {
            "wall_area_m2": round(wall_area, 2),
            "ceiling_area_m2": round(ceiling_area, 2),
            "net_area_m2": round(net_area, 2),
            "base_liters": round(base_liters, 2),
            "required_liters_with_waste": round(required_liters, 2),
        },
        "purchase": {
            "containers": containers,
            "total_liters": round(containers * args.container_liters, 2),
            **money(containers, args.unit_price),
        },
    }


def estimate_tile(args: argparse.Namespace) -> dict[str, Any]:
    net_area = args.length * args.width - args.openings_area
    if net_area <= 0:
        raise ValueError("openings area must be smaller than the floor or wall area")

    tile_area = (args.tile_length_cm / 100) * (args.tile_width_cm / 100)
    raw_tiles = net_area / tile_area
    required_tiles = math.ceil(raw_tiles * (1 + args.waste_percent / 100))
    boxes = math.ceil(required_tiles / args.tiles_per_box)

    return {
        "material": "tile",
        "inputs": {
            "surface_m": {"length": args.length, "width": args.width},
            "openings_area_m2": args.openings_area,
            "tile_cm": {"length": args.tile_length_cm, "width": args.tile_width_cm},
            "tiles_per_box": args.tiles_per_box,
            "waste_percent": args.waste_percent,
        },
        "calculations": {
            "net_area_m2": round(net_area, 2),
            "tile_area_m2": round(tile_area, 4),
            "raw_tiles": round(raw_tiles, 2),
            "required_tiles_with_waste": required_tiles,
        },
        "purchase": {
            "boxes": boxes,
            "total_tiles": boxes * args.tiles_per_box,
            **money(boxes, args.unit_price),
        },
    }


def estimate_wallpaper(args: argparse.Namespace) -> dict[str, Any]:
    cut_length = args.height + args.trim
    strips_per_roll = math.floor(args.roll_length / cut_length)
    if strips_per_roll < 1:
        raise ValueError("roll length is shorter than one wall-height strip including trim")

    perimeter = 2 * (args.length + args.width)
    base_strips = math.ceil(perimeter / args.roll_width)
    required_strips = math.ceil(base_strips * (1 + args.waste_percent / 100))
    rolls = math.ceil(required_strips / strips_per_roll)

    return {
        "material": "wallpaper",
        "inputs": {
            "room_m": {"length": args.length, "width": args.width, "height": args.height},
            "roll_m": {"width": args.roll_width, "length": args.roll_length},
            "trim_per_strip_m": args.trim,
            "waste_percent": args.waste_percent,
        },
        "calculations": {
            "perimeter_m": round(perimeter, 2),
            "cut_length_m": round(cut_length, 2),
            "strips_per_roll": strips_per_roll,
            "base_strips": base_strips,
            "required_strips_with_waste": required_strips,
        },
        "purchase": {
            "rolls": rolls,
            "available_strips": rolls * strips_per_roll,
            **money(rolls, args.unit_price),
        },
    }


def add_shared_room_arguments(parser: argparse.ArgumentParser, include_height: bool = False) -> None:
    parser.add_argument("--length", type=positive, required=True, help="Room or surface length in meters")
    parser.add_argument("--width", type=positive, required=True, help="Room or surface width in meters")
    if include_height:
        parser.add_argument("--height", type=positive, required=True, help="Room height in meters")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="mode", required=True)

    paint = subparsers.add_parser("paint", help="Estimate wall and optional ceiling paint")
    add_shared_room_arguments(paint, include_height=True)
    paint.add_argument("--openings-area", type=nonnegative, default=0.0, help="Total excluded area in m²")
    paint.add_argument("--ceiling", action="store_true", help="Include the ceiling")
    paint.add_argument("--coats", type=positive, default=2.0)
    paint.add_argument("--coverage", type=positive, default=10.0, help="Coverage in m² per liter per coat")
    paint.add_argument("--waste-percent", type=waste_percent, default=10.0)
    paint.add_argument("--container-liters", type=positive, default=5.0)
    paint.add_argument("--unit-price", type=nonnegative, help="Price per container")
    paint.set_defaults(handler=estimate_paint)

    tile = subparsers.add_parser("tile", help="Estimate floor or wall tiles")
    add_shared_room_arguments(tile)
    tile.add_argument("--openings-area", type=nonnegative, default=0.0, help="Total excluded area in m²")
    tile.add_argument("--tile-length-cm", type=positive, required=True)
    tile.add_argument("--tile-width-cm", type=positive, required=True)
    tile.add_argument("--tiles-per-box", type=int, required=True)
    tile.add_argument("--waste-percent", type=waste_percent, default=10.0)
    tile.add_argument("--unit-price", type=nonnegative, help="Price per box")
    tile.set_defaults(handler=estimate_tile)

    wallpaper = subparsers.add_parser("wallpaper", help="Estimate wallpaper rolls by strip layout")
    add_shared_room_arguments(wallpaper, include_height=True)
    wallpaper.add_argument("--roll-width", type=positive, default=0.53, help="Roll width in meters")
    wallpaper.add_argument("--roll-length", type=positive, default=10.0, help="Roll length in meters")
    wallpaper.add_argument("--trim", type=nonnegative, default=0.10, help="Total trim allowance per strip in meters")
    wallpaper.add_argument("--waste-percent", type=waste_percent, default=10.0)
    wallpaper.add_argument("--unit-price", type=nonnegative, help="Price per roll")
    wallpaper.set_defaults(handler=estimate_wallpaper)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if args.mode == "tile" and args.tiles_per_box <= 0:
        parser.error("--tiles-per-box must be greater than 0")
    try:
        result = args.handler(args)
    except ValueError as error:
        parser.error(str(error))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
