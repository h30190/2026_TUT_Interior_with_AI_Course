#!/usr/bin/env python3
"""
20261017 示範腳本：對 sample-specs.csv 跑 4 種分析方式。
純標準庫，不需要裝 pandas。
用法：python3 analyze-specs.py
"""

import csv
import os
import statistics
import sys
from collections import defaultdict

# 防 PowerShell cp950 編碼炸
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

CSV_PATH = os.path.join(os.path.dirname(__file__), "sample-specs.csv")


def load_data(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def descriptive(rows):
    """1. 描述性統計：單價的均值、中位數、極端值"""
    prices = []
    for r in rows:
        try:
            prices.append(float(r["單價"]))
        except (ValueError, KeyError):
            pass
    print("=== 1. 描述性統計（單價）===")
    print(f"  均值: {statistics.mean(prices):.2f}")
    print(f"  中位數: {statistics.median(prices):.2f}")
    print(f"  最小: {min(prices):.2f}")
    print(f"  最大: {max(prices):.2f}")
    print(f"  筆數: {len(prices)}")
    print()


def anomaly(rows):
    """2. 異常偵測：同材料組內離群單價、負數/零用量、單位混用"""
    print("=== 2. 異常偵測 ===")

    # 離群單價：在「同一材料」組內比對（跨材料比單價沒意義）
    groups = defaultdict(list)
    for r in rows:
        try:
            groups[r["材料名"]].append((r["供應商"], float(r["單價"])))
        except (ValueError, KeyError):
            pass

    for mat, items in groups.items():
        prices = [p for _, p in items]
        if len(prices) < 3:
            continue
        med = statistics.median(prices)
        for sup, p in items:
            # 比組內中位數偏離過大就標出（500 vs 磁磚組中位數 65）
            if med > 0 and (p > 3 * med or p < 0.3 * med):
                print(f"  [離群單價] {mat} {sup} 單價 {p}（組內中位數 {med:.0f}）")

    # 負數 / 零用量
    for r in rows:
        try:
            usage = float(r["用量"])
            if usage < 0:
                print(f"  [負數用量] {r['材料名']} {r['供應商']} 用量 {usage}")
            elif usage == 0:
                print(f"  [零用量] {r['材料名']} {r['供應商']} 用量 {usage}")
        except (ValueError, KeyError):
            pass

    # 單位混用：同材料名下單位不一致
    units_by_material = defaultdict(set)
    for r in rows:
        units_by_material[r["材料名"]].add(r["單位"])
    for mat, units in units_by_material.items():
        if len(units) > 1:
            print(f"  [單位混用] {mat} 出現單位: {sorted(units)}")
    print()


def comparison(rows):
    """3. 比較分析：同一材料多家供應商，找最划算的"""
    print("=== 3. 比較分析（同材料、不同供應商）===")
    groups = defaultdict(list)
    for r in rows:
        groups[r["材料名"]].append(r)

    for mat, items in groups.items():
        if len(items) < 2:
            continue
        print(f"  {mat}（{len(items)} 家供應商）:")
        cheapest = None
        for r in items:
            try:
                p = float(r["單價"])
                u = float(r["用量"])
                total = p * u
                print(f"    {r['供應商']}: 單價 {p} × 用量 {u} = {total:.0f}")
                if cheapest is None or total < cheapest[1]:
                    cheapest = (r["供應商"], total)
            except (ValueError, KeyError):
                pass
        if cheapest:
            print(f"    → 最划算: {cheapest[0]}（總額 {cheapest[1]:.0f}）")
    print()


def trend(rows):
    """4. 趨勢分析：每組材料的單價區間（無時間欄，以材料分組的 min/max 當走勢 proxy）"""
    print("=== 4. 趨勢分析（材料分組單價區間）===")
    groups = defaultdict(list)
    for r in rows:
        try:
            groups[r["材料名"]].append(float(r["單價"]))
        except (ValueError, KeyError):
            pass
    for mat, ps in sorted(groups.items()):
        lo, hi = min(ps), max(ps)
        print(f"  {mat}: 單價 {lo:.0f} ~ {hi:.0f}（區間 {hi - lo:.0f}）")
    print()


def main():
    rows = load_data(CSV_PATH)
    print(f"讀取 {CSV_PATH}：{len(rows)} 筆\n")
    descriptive(rows)
    anomaly(rows)
    comparison(rows)
    trend(rows)
    print("完成。")


if __name__ == "__main__":
    main()
