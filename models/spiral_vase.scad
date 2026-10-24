/* [Spiral Vase Parameters] */
height = 60; // [30:120]
base_radius = 20; // [10:50]
top_radius = 28; // [10:60]
twists = 180; // [0:360]
num_facets = 8; // [3:12]

// Generate spiral vase using linear_extrude with twist and scale
linear_extrude(height = height, twist = twists, scale = top_radius / base_radius, slices = 60) {
  circle(r = base_radius, $fn = num_facets);
}
