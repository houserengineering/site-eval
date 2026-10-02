# Writes test/fixtures/example-job.json: a synthetic job file (made-up map and header) for the
# e2e tests. Real job files hold client data and never live in this repository.
import base64, io, json, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H = 900, 700
im = Image.new('RGB', (W, H), (196, 178, 128))
d = ImageDraw.Draw(im)
for i in range(0, W, 150):
    d.line([(i, 0), (i, H)], fill=(40, 40, 40), width=3)
for j in range(0, H, 175):
    d.line([(0, j), (W, j)], fill=(40, 40, 40), width=3)
d.rectangle([380, 0, 420, H], fill=(150, 150, 150))
try:
    font = ImageFont.truetype('arial.ttf', 28)
except OSError:
    font = None
d.text((20, H - 40), 'EXAMPLE SUBDIVISION (synthetic)', fill=(0, 0, 0), font=font)
buf = io.BytesIO()
im.save(buf, 'JPEG', quality=70)

# 0.25 m/px, north up; the e2e geolocation (45.678901, -111.234567) falls inside the map.
lat0, lon0 = 45.6798, -111.236
gr = [0.25 / (111320 * math.cos(math.radians(45.679))), 0, lon0, 0, -0.25 / 110574, lat0]
pins = [(150, 250), (450, 300), (750, 500)]
ll = lambda x, y: {'lat': round(gr[4] * y + gr[5], 7), 'lon': round(gr[0] * x + gr[2], 7)}
job = {
    'kind': 'site-eval-job',
    'version': 1,
    'header': {'projectNumber': '0999.007', 'projectName': 'Example Subdivision', 'location': '100 Example Road, Bozeman', 'evalBy': 'Test Evaluator', 'date': '2026-10-02', 'confirmationNumber': 'SE 00001', 'ownerName': 'Example LLC'},
    'unconfirmed': {'confirmationNumber': 'Not found in any county document (synthetic example).'},
    'deliverableFolder': '0999\\Site Evaluation\\',
    'testPits': [{'label': str(i + 1), 'planned': ll(*p)} for i, p in enumerate(pins)],
    'map': {
        'title': 'Example Test Pit Map', 'source': 'synthetic', 'mimeType': 'image/jpeg', 'width': W, 'height': H,
        'image': base64.b64encode(buf.getvalue()).decode(),
        'pins': [{'label': str(i + 1), 'x': p[0], 'y': p[1]} for i, p in enumerate(pins)],
        'georef': {'pxToLonLat': gr, 'method': 'synthetic', 'controlPoints': 12, 'rmsFt': 1.2, 'p95Ft': 2.3, 'maxFt': 2.5},
    },
}
Path(__file__).parent.parent.joinpath('test/fixtures/example-job.json').write_text(json.dumps(job))
