/* [Multi-Library Showcase] */
// Demonstrates BOSL2, threads.scad, catchnhole, and pins.scad working together.

include <BOSL2/std.scad>
use <threads.scad>
use <catchnhole/catchnhole.scad>
use <pins.scad>

$fn = 40;

/* [Main Body Parameters] */
body_length = 54; // [40:80]
body_width  = 36; // [25:60]
body_height = 16; // [12:30]
thread_dia  = 20; // [12:28]

module main_enclosure() {
    difference() {
        // 1. BOSL2 rounded body with filleted top boss
        cuboid([body_length, body_width, body_height], rounding=3, edges="Z", anchor=BOTTOM) {
            attach(TOP, BOTTOM)
                cylinder(d=thread_dia + 6, h=10);
        }

        // 2. threads.scad internal metric ISO thread (M20x1.5)
        translate([0, 0, body_height - 2])
            metric_thread(diameter=thread_dia, pitch=1.5, length=14, internal=true);

        // Center access bore
        translate([0, 0, -1])
            cylinder(d=thread_dia - 6, h=body_height);

        // 3. Catch'n'Hole bolt holes with socket head counterbores & nutcatches
        for (dx = [-20, 20]) {
            translate([dx, 0, 0]) {
                // Pass-through M3 bolt with socket head counterbore
                translate([0, 0, body_height])
                    rotate([180, 0, 0])
                        bolt("M3", length=body_height + 2, kind="socket_head");
                // M3 hex nut catch underneath
                translate([0, 0, -0.01])
                    nutcatch_parallel("M3", height_clearance=0.5);
            }
        }
    }
}

module threaded_cap() {
    difference() {
        // Knurled / grooved cap grip
        cylinder(d=thread_dia + 6, h=10);
        for (i = [0:30:360]) {
            rotate([0, 0, i])
                translate([thread_dia / 2 + 3, 0, -1])
                    cylinder(r=1, h=12);
        }
    }
    // Matching external thread
    translate([0, 0, 10])
        metric_thread(diameter=thread_dia - 0.4, pitch=1.5, length=8, internal=false);
}

// 1. Main Enclosure Block
main_enclosure();

// 2. Threaded Screw Cap (placed to the right)
translate([45, 0, 0])
    threaded_cap();

// 3. Push-fit Snap Pin (placed to the left)
translate([-42, 0, 0])
    pin(h=14, r=3.5);
