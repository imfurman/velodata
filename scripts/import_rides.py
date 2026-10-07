#!/usr/bin/env python3
"""Convert a Strava export or directory of FIT/GPX/TCX files into public JSON."""
import argparse
import csv
import gzip
import hashlib
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET

from garmin_fit_sdk import Decoder, Stream

MONTHS = {'янв': 1, 'февр': 2, 'мар': 3, 'март': 3, 'апр': 4, 'мая': 5, 'май': 5,
          'июн': 6, 'июл': 7, 'авг': 8, 'сент': 9, 'окт': 10, 'нояб': 11, 'дек': 12}


def number(value, default=None):
    try:
        result = float(str(value).replace(',', '.'))
        return result if math.isfinite(result) else default
    except (ValueError, TypeError):
        return default


def distance(a, b):
    lat1, lat2 = math.radians(a[0]), math.radians(b[0])
    v = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(math.radians(b[1]-a[1])/2)**2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(v)))


def timestamp(value):
    if isinstance(value, datetime):
        return value.timestamp()
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()
    except ValueError:
        return None


def read_track(path):
    raw = path.read_bytes()
    if path.suffix.lower() == '.gz':
        raw = gzip.decompress(raw)
    points, meta = [], {}
    if '.fit' in path.name.lower():
        messages, errors = Decoder(Stream.from_byte_array(bytearray(raw))).read()
        if errors:
            raise ValueError('FIT decoder: ' + '; '.join(map(str, errors)))
        meta = next(iter(messages.get('session_mesgs', [])), {})
        for r in messages.get('record_mesgs', []):
            lat, lon = r.get('position_lat'), r.get('position_long')
            if lat is None or lon is None:
                continue
            points.append([lat * 180 / 2**31, lon * 180 / 2**31,
                           number(r.get('enhanced_altitude', r.get('altitude'))),
                           timestamp(r.get('timestamp')), number(r.get('distance'))])
    else:
        root = ET.fromstring(raw)
        # Both standard GPX and TCX namespaces are handled through local tag names.
        for node in root.iter():
            node.tag = node.tag.rsplit('}', 1)[-1]
        if root.tag == 'gpx':
            for segment in root.findall('.//trkseg'):
                if points:
                    points.append(None)
                for p in segment.findall('trkpt'):
                    points.append([number(p.get('lat')), number(p.get('lon')),
                                   number(p.findtext('ele')), timestamp(p.findtext('time')), None])
        else:
            for segment in root.findall('.//Track'):
                if points:
                    points.append(None)
                for p in segment.findall('Trackpoint'):
                    points.append([number(p.findtext('Position/LatitudeDegrees')),
                                   number(p.findtext('Position/LongitudeDegrees')),
                                   number(p.findtext('AltitudeMeters')), timestamp(p.findtext('Time')),
                                   number(p.findtext('DistanceMeters'))])
    valid = []
    for p in points:
        if p is None:
            valid.append(None)
        elif p[0] is not None and p[1] is not None and -90 <= p[0] <= 90 and -180 <= p[1] <= 180 and (p[0] or p[1]):
            valid.append(p)
    return valid, meta


def geometry(points):
    segments, current, profile = [], [], []
    prev, total, last_kept = None, 0, None
    for p in points:
        if p is None:
            if len(current) > 1:
                segments.append(current)
            current, prev, last_kept = [], None, None
            continue
        step = distance(prev, p) if prev else 0
        dt = p[3] - prev[3] if prev and p[3] is not None and prev[3] is not None else None
        if prev and (step > 5000 or (dt and dt > 0 and step / dt > 40)):
            if len(current) > 1:
                segments.append(current)
            current, last_kept, step = [], None, 0
        total += step
        if p[2] is not None:
            profile.append([round((p[4] if p[4] is not None else total) / 1000, 3), round(p[2], 1)])
        if last_kept is None or distance(last_kept, p) >= 35:
            current.append([round(p[0], 5), round(p[1], 5)])
            last_kept = p
        prev = p
    if prev is not None and current:
        end = [round(prev[0], 5), round(prev[1], 5)]
        if current[-1] != end:
            current.append(end)
    if len(current) > 1:
        segments.append(current)
    if len(profile) > 200:
        profile = [profile[round(i * (len(profile) - 1) / 199)] for i in range(200)]
    return segments, profile, total


def export_date(text):
    match = re.match(r'(\d+)\s+(\S+)\s+(\d{4})', text)
    if match:
        day, month, year = match.groups()
        return f'{year}-{MONTHS[month.rstrip(".")]:02d}-{int(day):02d}'
    return datetime.strptime(text, '%b %d, %Y, %I:%M:%S %p').date().isoformat()


def import_directory(source):
    csv_path = source / 'activities.csv'
    rows = None
    if csv_path.exists():
        with csv_path.open(encoding='utf-8-sig', newline='') as f:
            reader = csv.reader(f)
            next(reader)
            rows = list(reader)
    rides, errors, skipped = [], [], 0
    entries = [(source / r[12], r) for r in rows] if rows is not None else [(p, None) for p in sorted(source.rglob('*')) if p.is_file() and re.search(r'\.(fit|gpx|tcx)(\.gz)?$', p.name, re.I)]
    for path, row in entries:
        if row and row[3] not in ('Велосипед', 'Велозаезд', 'Ride', 'Virtual Ride', 'Виртуальный велозаезд', 'E-Bike Ride'):
            skipped += 1
            continue
        try:
            if not path.resolve().is_relative_to(source.resolve()):
                raise ValueError('Track path must be within the source directory')
            points, meta = read_track(path)
            if not row and '.fit' not in path.name.lower():
                raise ValueError('Standalone GPX/TCX requires activities.csv for reliable summary statistics')
            if not row and meta.get('sport') not in (None, 'cycling'):
                skipped += 1
                continue
            route, profile, gps_distance = geometry(points)
            valid = [p for p in points if p is not None]
            start = timestamp(meta.get('start_time')) or next((p[3] for p in valid if p[3]), None)
            date = export_date(row[1]) if row else datetime.fromtimestamp(start, timezone.utc).date().isoformat() if start else None
            if not date:
                raise ValueError('No activity date')
            def field(index, key, default=None):
                return number(row[index], default) if row else number(meta.get(key), default)
            meters = field(17, 'total_distance', gps_distance)
            moving = field(16, 'total_timer_time', 0)
            elapsed = field(15, 'total_elapsed_time', moving)
            raw = path.read_bytes()
            digest = hashlib.sha256(gzip.decompress(raw) if path.suffix.lower() == '.gz' else raw).hexdigest()
            rides.append({
                'id': row[0] if row else digest[:20], 'sourceHash': digest,
                'date': date, 'title': row[2] if row else f'Велопоездка · {date}',
                'distanceKm': round(meters / 1000, 2), 'movingSeconds': round(moving),
                'elapsedSeconds': round(elapsed), 'elevationM': round(field(20, 'total_ascent', 0)),
                'avgSpeed': round(meters / moving * 3.6, 1) if moving else None,
                'maxSpeed': round(field(18, 'max_speed', 0) * 3.6, 1),
                'heartRate': field(31, 'avg_heart_rate'), 'power': field(33, 'avg_power'),
                'bike': row[11] if row else '', 'route': route, 'profile': profile,
                'source': 'fit' if '.fit' in path.name.lower() else 'gpx' if '.gpx' in path.name.lower() else 'tcx',
            })
        except Exception as exc:
            errors.append({'file': path.name, 'error': str(exc)})
    rides.sort(key=lambda r: (r['date'], r['id']), reverse=True)
    ids = [r['id'] for r in rides]
    if len(ids) != len(set(ids)):
        errors.append({'file': 'input', 'error': 'Duplicate activity IDs'})
    return rides, errors, skipped


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, default=Path('public/data/rides.json'))
    parser.add_argument('--merge', action='store_true', help='Add new rides, preserving existing rides and avoiding duplicate source files')
    args = parser.parse_args()
    if not args.source.is_dir():
        parser.error('source must be an existing directory')
    rides, errors, skipped = import_directory(args.source)
    if errors or not rides:
        print(json.dumps({'errors': errors, 'rides': len(rides), 'skipped': skipped}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1
    if args.merge and args.output.exists():
        existing = json.loads(args.output.read_text(encoding='utf-8'))
        if existing.get('schemaVersion') != 1:
            parser.error('cannot merge an unsupported schema')
        old = existing['rides']
        hashes = {r.get('sourceHash') for r in old}
        ids = {r['id'] for r in old}
        rides = old + [r for r in rides if r['sourceHash'] not in hashes and r['id'] not in ids]
        rides.sort(key=lambda r: (r['date'], r['id']), reverse=True)
    data = {'schemaVersion': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(),
            'privacy': 'full-routes', 'rides': rides}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    temporary.replace(args.output)
    print(json.dumps({'rides': len(rides), 'skipped': skipped, 'km': round(sum(r['distanceKm'] for r in rides)),
                      'withMap': sum(bool(r['route']) for r in rides), 'output': str(args.output)}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
