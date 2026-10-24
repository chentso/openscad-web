/* [Parameters] */
// Width of the box in mm
width = 45; // [20:100]

// Depth of the box in mm
depth = 35; // [20:80]

// Height of the box in mm
height = 25; // [10:60]

// Wall thickness in mm
wall_thickness = 2.5; // [1:0.5:5]

// Corner rounding radius
corner_radius = 4; // [0:10]

// Add center hole
center_hole = true;

// Level of detail
$fn = 32;

module rounded_cube(size, r) {
  x = size[0];
  y = size[1];
  z = size[2];
  hull() {
    translate([r, r, 0]) cylinder(r=r, h=z);
    translate([x - r, r, 0]) cylinder(r=r, h=z);
    translate([r, y - r, 0]) cylinder(r=r, h=z);
    translate([x - r, y - r, 0]) cylinder(r=r, h=z);
  }
}

difference() {
  // Outer enclosure
  rounded_cube([width, depth, height], corner_radius);

  // Inner hollow cavity
  translate([wall_thickness, wall_thickness, wall_thickness])
    rounded_cube(
      [width - 2 * wall_thickness, depth - 2 * wall_thickness, height],
      max(1, corner_radius - wall_thickness)
    );

  // Center cable / ventilation port
  if (center_hole) {
    translate([width / 2, depth / 2, -1])
      cylinder(r=6, h=wall_thickness + 2);
  }
}
