#!/usr/bin/env python3
"""Convert buildings CSV to JSON format for game."""

import csv
import json

def parse_value(value):
    """Parse string value to appropriate type."""
    if value == '':
        return None
    try:
        # Try integer first
        if '.' not in value:
            return int(value)
        # Then float
        return float(value)
    except ValueError:
        # Check for boolean
        if value.lower() in ('true', 'false'):
            return value.lower() == 'true'
        # Return as string
        return value

def csv_to_buildings_json(csv_file):
    """Convert CSV to buildings JSON structure."""
    buildings_by_category = {}

    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)

        for row in reader:
            if not row['id']:  # Skip empty rows
                continue

            building = {
                "id": row['id'],
                "name": row['name'],
                "category": row['category'],
                "description": row['description'],
                "graphicsFile": row['graphicsFile'],
                "isDefault": parse_value(row['isDefault']),
                "civicScore": parse_value(row['civicScore']),

                "economics": {
                    "buildCost": parse_value(row['buildCost']),
                    "constructionDays": parse_value(row['constructionDays']),
                    "maxRevenue": parse_value(row['maxRevenue']),
                    "maintenanceCost": parse_value(row['maintenanceCost']),
                    "decayRate": parse_value(row['decayRate'])
                },

                "resources": {
                    "jobsProvided": parse_value(row['jobsProvided']),
                    "jobsRequired": parse_value(row['jobsRequired']),
                    "energyProvided": parse_value(row['energyProvided']),
                    "energyRequired": parse_value(row['energyRequired']),
                    "educationProvided": parse_value(row['educationProvided']),
                    "educationRequired": parse_value(row['educationRequired']),
                    "foodProvided": parse_value(row['foodProvided']),
                    "foodRequired": parse_value(row['foodRequired']),
                    "housingProvided": parse_value(row['housingProvided']),
                    "housingRequired": parse_value(row['housingRequired']),
                    "healthcareProvided": parse_value(row['healthcareProvided']),
                    "healthcareRequired": parse_value(row['healthcareRequired'])
                },

                "livability": {
                    "culture": {
                        "impact": parse_value(row['culture_impact']),
                        "attenuation": parse_value(row['culture_attenuation'])
                    },
                    "affordability": {
                        "impact": parse_value(row['affordability_impact']),
                        "attenuation": parse_value(row['affordability_attenuation'])
                    },
                    "resilience": {
                        "impact": parse_value(row['resilience_impact']),
                        "attenuation": parse_value(row['resilience_attenuation'])
                    },
                    "environment": {
                        "impact": parse_value(row['environment_impact']),
                        "attenuation": parse_value(row['environment_attenuation'])
                    },
                    "noise": {
                        "impact": parse_value(row['noise_impact']),
                        "attenuation": parse_value(row['noise_attenuation'])
                    },
                    "safety": {
                        "impact": parse_value(row['safety_impact']),
                        "attenuation": parse_value(row['safety_attenuation'])
                    }
                },

                "graphics": {
                    "filename": row['graphicsFile'].split('/')[-1],
                    "path": row['graphicsFile'],
                    "fallbackPath": "assets/buildings/default.svg"
                },

                "images": {
                    "built": row['graphicsFile']
                }
            }

            # Group by category
            category = building['category']
            if category not in buildings_by_category:
                buildings_by_category[category] = []
            buildings_by_category[category].append(building)

    return buildings_by_category

def main():
    import sys

    # Allow CSV filename as argument, default to buildings-data-final.csv
    input_csv = sys.argv[1] if len(sys.argv) > 1 else 'buildings-data-final.csv'
    output_json = 'buildings-data.json'

    buildings = csv_to_buildings_json(input_csv)

    # Write JSON with nice formatting
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(buildings, f, indent=2, ensure_ascii=False)

    print(f"Converted {input_csv} to {output_json}")
    print(f"Categories: {list(buildings.keys())}")
    print(f"Total buildings: {sum(len(b) for b in buildings.values())}")

if __name__ == '__main__':
    main()
