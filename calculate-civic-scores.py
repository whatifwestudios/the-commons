#!/usr/bin/env python3
"""
Calculate civic scores for buildings using CARENS impacts and attenuation.

Formula: civicScore = sum(impact / sqrt(attenuation)) for all CARENS dimensions
"""

import csv
import math

def calculate_civic_score(building):
    """Calculate civic score from CARENS impacts and attenuations."""
    dimensions = [
        ('culture_impact', 'culture_attenuation'),
        ('affordability_impact', 'affordability_attenuation'),
        ('resilience_impact', 'resilience_attenuation'),
        ('environment_impact', 'environment_attenuation'),
        ('noise_impact', 'noise_attenuation'),
        ('safety_impact', 'safety_attenuation'),
    ]

    civic_score = 0.0
    breakdown = []

    for impact_key, atten_key in dimensions:
        impact = float(building.get(impact_key, 0) or 0)
        attenuation = float(building.get(atten_key, 1) or 1)

        # Prevent division by zero
        if attenuation == 0:
            attenuation = 1

        # Formula: impact / sqrt(attenuation)
        weighted_impact = impact / math.sqrt(attenuation)
        civic_score += weighted_impact

        dimension_name = impact_key.replace('_impact', '')
        breakdown.append(f"{dimension_name}: {impact}/{attenuation} = {weighted_impact:.1f}")

    return round(civic_score, 1), breakdown

def main():
    import sys

    # Allow input file as argument, default to buildings-data-revised.csv
    input_file = sys.argv[1] if len(sys.argv) > 1 else 'buildings-data-revised.csv'

    # Output file is same as input (overwrite)
    output_file = input_file

    # Read CSV
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        buildings = list(reader)
        fieldnames = reader.fieldnames

    # Calculate civic scores
    print("=" * 80)
    print("CIVIC SCORE CALCULATIONS")
    print("=" * 80)
    print()

    for building in buildings:
        if not building['id']:  # Skip empty rows
            continue

        civic_score, breakdown = calculate_civic_score(building)
        building['civicScore'] = str(civic_score)

        print(f"{building['name']} ({building['category']})")
        print(f"  Civic Score: {civic_score}")
        for line in breakdown:
            print(f"    {line}")
        print()

    # Sort buildings by civic score for review
    buildings_sorted = sorted(
        [b for b in buildings if b['id']],
        key=lambda b: float(b['civicScore']),
        reverse=True
    )

    print("=" * 80)
    print("BUILDINGS RANKED BY CIVIC SCORE")
    print("=" * 80)
    for b in buildings_sorted:
        print(f"{float(b['civicScore']):7.1f}  {b['name']:25s} ({b['category']})")
    print()

    # Write updated CSV
    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(buildings)

    print(f"✓ Written to {output_file}")

if __name__ == '__main__':
    main()
