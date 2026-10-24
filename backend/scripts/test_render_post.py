import urllib.request
import json

code = """/* [Parameters] */
width = 45;
depth = 35;
height = 25;
wall_thickness = 2.5;
corner_radius = 4;
center_hole = true;
$fn = 32;

module rounded_cube(size, r) {
  x = size[0]; y = size[1]; z = size[2];
  hull() {
    translate([r, r, 0]) cylinder(r=r, h=z);
    translate([x - r, r, 0]) cylinder(r=r, h=z);
    translate([r, y - r, 0]) cylinder(r=r, h=z);
    translate([x - r, y - r, 0]) cylinder(r=r, h=z);
  }
}

difference() {
  rounded_cube([width, depth, height], corner_radius);
  translate([wall_thickness, wall_thickness, wall_thickness])
    rounded_cube([width - 2 * wall_thickness, depth - 2 * wall_thickness, height], max(1, corner_radius - wall_thickness));
  if (center_hole) {
    translate([width / 2, depth / 2, -1]) cylinder(r=6, h=wall_thickness + 2);
  }
}
"""

req = urllib.request.Request(
    'http://127.0.0.1:8000/api/render/compile',
    headers={'Content-Type': 'application/json'},
    data=json.dumps({'code': code, 'format': 'stl', 'enable_manifold': True}).encode('utf-8')
)

try:
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        print('Success:', res['success'])
        print('Render time ms:', res['render_time_ms'])
        print('Mesh base64 length:', len(res['mesh_base64']) if res.get('mesh_base64') else 0)
        print('Stdout:', res['stdout'][:100])
except Exception as e:
    print('Error:', e)
