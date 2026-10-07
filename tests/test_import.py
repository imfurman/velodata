import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('import_rides', Path(__file__).parents[1] / 'scripts/import_rides.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ImportTests(unittest.TestCase):
    def test_localized_date_and_invalid_numbers(self):
        self.assertEqual(module.export_date('1 окт. 2026\u202fг., 06:48:48'), '2026-10-01')
        self.assertEqual(module.export_date('23 июн. 2023 г., 05:37:12'), '2023-06-23')
        self.assertEqual(module.number('12,5'), 12.5)
        self.assertIsNone(module.number('NaN'))

    def test_gpx_namespaces_and_segments(self):
        xml = '''<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk>
        <trkseg><trkpt lat="43" lon="27"><ele>12</ele><time>2026-01-01T10:00:00Z</time></trkpt>
        <trkpt lat="43.001" lon="27"><ele>15</ele><time>2026-01-01T10:00:30Z</time></trkpt></trkseg>
        <trkseg><trkpt lat="44" lon="28"/><trkpt lat="44.001" lon="28"/></trkseg>
        </trk></gpx>'''
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'test.gpx'
            path.write_text(xml)
            points, _ = module.read_track(path)
        segments, profile, meters = module.geometry(points)
        self.assertEqual(len(segments), 2)
        self.assertEqual(profile[0], [0,12])
        self.assertAlmostEqual(meters,222.39,delta=1)

    def test_gps_teleports_do_not_create_lines(self):
        points = [[43,27,10,0,None],[43.001,27,11,30,None],[50,30,12,31,None],[50.001,30,13,61,None]]
        segments, _, meters = module.geometry(points)
        self.assertEqual(len(segments),2)
        self.assertLess(meters,250)


if __name__ == '__main__':
    unittest.main()
