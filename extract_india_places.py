import osmium
import csv
import os
import sys

SOURCE = r"C:\Users\danus\Downloads\india-261019.osm.pbf"
OUTPUT_DIR = "data"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "india_places.csv")

# Keep named places useful for travel discovery.
PLACE_KEYS = {
    "tourism", "historic", "leisure", "amenity", "shop",
    "natural", "waterway", "sport", "man_made",
    "railway", "public_transport"
}

FIELDS = [
    "osm_type", "osm_id", "name", "latitude", "longitude",
    "category", "subcategory", "address", "website",
    "phone", "opening_hours", "wheelchair"
]

def value(tags, key):
    return tags.get(key, "")

class PlaceHandler(osmium.SimpleHandler):
    def __init__(self, writer):
        super().__init__()
        self.writer = writer
        self.count = 0

    def save(self, obj, lat, lon, osm_type):
        tags = obj.tags
        name = tags.get("name", "").strip()

        if not name:
            return

        matches = [(k, tags.get(k, "")) for k in PLACE_KEYS if tags.get(k)]
        if not matches:
            return

        # One row per mapped object; retain the first matching category.
        category, subcategory = sorted(matches)[0]

        address_parts = [
            tags.get("addr:housenumber", ""),
            tags.get("addr:street", ""),
            tags.get("addr:suburb", ""),
            tags.get("addr:city", ""),
            tags.get("addr:state", ""),
            tags.get("addr:postcode", "")
        ]
        address = ", ".join(x for x in address_parts if x)

        self.writer.writerow({
            "osm_type": osm_type,
            "osm_id": obj.id,
            "name": name,
            "latitude": lat,
            "longitude": lon,
            "category": category,
            "subcategory": subcategory,
            "address": address,
            "website": value(tags, "website") or value(tags, "contact:website"),
            "phone": value(tags, "phone") or value(tags, "contact:phone"),
            "opening_hours": value(tags, "opening_hours"),
            "wheelchair": value(tags, "wheelchair")
        })
        self.count += 1
        if self.count % 100000 == 0:
            print(f"Extracted {self.count:,} named places...", flush=True)

    def node(self, n):
        if n.location.valid():
            self.save(n, n.location.lat, n.location.lon, "node")

    def way(self, w):
        # Use the centre of the way's bounding box as a practical initial point.
        try:
            loc = w.location
            if loc.valid():
                self.save(w, loc.lat, loc.lon, "way")
            else:
                # Calculate a bounding-box centre from node coordinates.
                coords = [(nd.lon, nd.lat) for nd in w.nodes if nd.location.valid()]
                if coords:
                    lon = (min(x[0] for x in coords) + max(x[0] for x in coords)) / 2
                    lat = (min(x[1] for x in coords) + max(x[1] for x in coords)) / 2
                    self.save(w, lat, lon, "way")
        except Exception:
            pass

    def area(self, a):
        # Area processing is deliberately skipped in this first pass.
        # Many places are already represented by nodes or ways.
        pass

def main():
    if not os.path.isfile(SOURCE):
        sys.exit(f"Dataset not found: {SOURCE}")

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print("Reading India OSM dataset. This may take several minutes.", flush=True)

    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        handler = PlaceHandler(writer)
        handler.apply_file(SOURCE, locations=True)

    print(f"Finished. Extracted {handler.count:,} rows.")
    print(f"CSV saved to: {os.path.abspath(OUTPUT_FILE)}")

if __name__ == "__main__":
    main()
