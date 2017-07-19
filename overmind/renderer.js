let $ = require('./3p/jquery-3.1.1.js');

// These filepath specification are so incoherent. Probably physi.js's bug.
Physijs.scripts.worker = './3p/physijs_worker.js';
Physijs.scripts.ammo = './ammo.js';

function setup_swarm() {
  var svg = d3.select("svg"),
    width = +svg.attr("width"),
    height = +svg.attr("height");

  var color = d3.scaleOrdinal(d3.schemeCategory20);

  var simulation = d3.forceSimulation()
    .force("link", d3.forceLink().id(function (d) {
      return d.id;
    }))
    .force("charge", d3.forceManyBody())
    .force("centering-X", d3.forceX().strength(d => {
        return d.depth === 0 ? 0.5 : 0.05;
      })
      .x(d => {
        return width / 2;
      }))
    .force("depth", d3.forceY().strength(d => {
        return d.depth === undefined ? 0 : 0.5;
      })
      .y(d => {
        return d.depth === undefined ? 0 : d.depth * 50 + 20; // just don't return NaN
      }));
  //  .force("center", d3.forceCenter(width / 2, height / 2));

  d3.json("fake_swarm.json", function (error, graph) {
    if (error) throw error;

    var link = svg.append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(graph.links)
      .enter().append("line")
      .attr("stroke-width", function (d) {
        return Math.sqrt(d.value);
      });

    var node = svg.append("g")
      .attr("class", "nodes")
      .selectAll("circle")
      .data(graph.nodes)
      .enter().append("circle")
      .attr("r", 5)
      .attr("fill", function (d) {
        return color(d.group);
      })
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    node.append("title")
      .text(function (d) {
        return d.id;
      });

    simulation
      .nodes(graph.nodes)
      .on("tick", ticked);

    simulation.force("link")
      .links(graph.links);

    function ticked() {
      link
        .attr("x1", function (d) {
          return d.source.x;
        })
        .attr("y1", function (d) {
          return d.source.y;
        })
        .attr("x2", function (d) {
          return d.target.x;
        })
        .attr("y2", function (d) {
          return d.target.y;
        });

      node
        .attr("cx", function (d) {
          return d.x;
        })
        .attr("cy", function (d) {
          return d.y;
        });
    }
  });

  function dragstarted(d) {
    if (!d3.event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(d) {
    d.fx = d3.event.x;
    d.fy = d3.event.y;
  }

  function dragended(d) {
    if (!d3.event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

}

class ImmutableCubeEdge {
  constructor(p0, p1) {
    let corner_margin = 1e-3;
    let seg = new THREE.Line3(p0, p1);

    let margin_dparam = corner_margin / seg.distance();
    this.p0 = seg.at(margin_dparam);
    this.p1 = seg.at(1 - margin_dparam);
    this._segment = new THREE.Line3(this.p0, this.p1);
  }

  touches(edge) {
    // TODO: current impl sucks. Use analytically closed form, maybe.
    let n = 0.02 / 0.001;
    let ds = _.map(_.range(n), (ix) => {
      let target = edge._segment.at(ix / n);
      let on_seg = this._segment.closestPointToPoint(target, true);
      return target.distanceTo(on_seg);
    });
    return Math.min.apply(null, ds) <= 0.001;
  }
}

// A cube in 3D space frozen in time, which bunch of methods to query spatial
// properties.
class ImmutableCube {
  constructor(mesh) {
    this.position = mesh.position.clone();
    this.rotation = mesh.quaternion.clone();
    this.size = mesh.userData.size;
  }

  get_edges() {
    let p = _.map(_.range(0, 8), (ix) => this.transform_vertex((ix & 4) / 4, (ix & 2) / 2, ix & 1));
    return [
      // z = 0
      new ImmutableCubeEdge(p[0b000], p[0b100]),
      new ImmutableCubeEdge(p[0b100], p[0b110]),
      new ImmutableCubeEdge(p[0b110], p[0b010]),
      new ImmutableCubeEdge(p[0b010], p[0b000]),
      // z: 0 - 1
      new ImmutableCubeEdge(p[0b000], p[0b001]),
      new ImmutableCubeEdge(p[0b100], p[0b101]),
      new ImmutableCubeEdge(p[0b110], p[0b111]),
      new ImmutableCubeEdge(p[0b010], p[0b011]),
      // z = 1
      new ImmutableCubeEdge(p[0b001], p[0b101]),
      new ImmutableCubeEdge(p[0b101], p[0b111]),
      new ImmutableCubeEdge(p[0b111], p[0b011]),
      new ImmutableCubeEdge(p[0b011], p[0b001]),
    ];
  }

  transform_vertex(x, y, z) {
    return new THREE.Vector3(x - 0.5, y - 0.5, z - 0.5)
        .multiplyScalar(this.size).applyQuaternion(this.rotation).add(this.position);
  }
}

class View3DClient {
  // TODO: Might be better to use CGS unit system instead of SI, since
  // 1. physijs doc is poor
  // 2. official examples assume cgs-like unit system, and exhibts slightly stable behavior
  constructor() {
    var _this = this;
    $('#calc_power_net').click(()=>_this.calc_power_net());

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 7);
    this.camera.up = new THREE.Vector3(0, 0, 1);
    this.camera.position.x = 0.3;
    this.camera.position.y = 0.3;
    this.camera.position.z = 0.3;
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));

    this.scene = new Physijs.Scene({
      fixedTimestamp: 1 / 120
    });
    this.scene.setGravity(new THREE.Vector3(0, 0, -0.3));
    this.scene.addEventListener(
      'update',
      function () {
        _this.scene.simulate(undefined, 1);
      }
    );

    let sunlight = new THREE.DirectionalLight(0xcccccc);
    sunlight.position.set(0, 0, 1).normalize();
    this.scene.add(sunlight);

    this.scene.add(new THREE.AmbientLight(0x333333));

    let bg = new THREE.Mesh(
      new THREE.IcosahedronGeometry(5, 1),
      new THREE.MeshBasicMaterial({
        wireframe: true,
        color: '#ccc'
      }));
    this.scene.add(bg);

    this.texture_loader = new THREE.TextureLoader();

    this.add_table();

    _.each(_.range(50), (i) => {
      let tile = _this.create_tile();
      tile.rotation.x = Math.random() * Math.PI;
      tile.rotation.y = Math.random() * Math.PI;
      tile.rotation.z = Math.random() * Math.PI;

      tile.position.x = (Math.random() - 0.5) * 0.05 + (i % 7) / 7 * 0.1;
      tile.position.y = (Math.random() - 0.5) * 0.05 + (i % 5) / 5 * 0.1;
      tile.position.z = 0.003 * i + 0.01;
      _this.scene.add(tile);
    });

    // start canvas
    this.renderer = new THREE.WebGLRenderer({
      antialias: true
    });

    this.renderer.setSize(400, 600);
    this.renderer.setClearColor('#aac');
    $('#viewport').append(this.renderer.domElement);

    this.controls = new THREE.TrackballControls(this.camera, this.renderer.domElement);
    this.controls.noZoom = false;
    this.controls.noPan = false;
    this.controls.zoomSpeed = 0.1;
    this.controls.maxDistance = 2;

    $(window).resize(() => {
      _this.update_projection();
    });

    this.update_projection();
  }

  calc_power_net() {
    let cubes = [];
    _.each(this.scene.children, (elem) => {
      if (elem.type !== "Mesh" || elem.userData["cube"] !== true) {
        return;
      }
      cubes.push(new ImmutableCube(elem));
    });
    let edges = [];
    _.each(cubes, cube => edges.push.apply(edges, cube.get_edges()));

    // Calculate contacts.
    let pairs = [];
    _.each(edges, (e0, i0) => {
      _.each(edges.slice(i0 + 1, edges.length), (e1, i1) => {
        if (e0.touches(e1)) {
          pairs.push([e0, e1]);
        }
      });
    });
    console.log("edge-edge contacts", pairs.length);

    // Add visualizing objects.

    _.each(pairs, pair => {
      this.add_ephemeral_edge_highlight(pair[0]);
      this.add_ephemeral_edge_highlight(pair[1]);
    });

    // _.each(edges, e => this.add_ephemeral_edge_highlight(e));

  }

  add_ephemeral_edge_highlight(edge) {
    let mat = new THREE.LineBasicMaterial({
      color: "hotpink",
      linewidth: 5,
    });

    let geom = new THREE.Geometry();
    geom.vertices.push(edge.p0);
    geom.vertices.push(edge.p1);

    let obj = new THREE.Line(geom, mat);
    this.scene.add(obj);

    let t0 = Date.now();
    let iv_id = window.setInterval(() => {
      let age_sec = (Date.now() - t0) * 1e-3;
      if (age_sec < 10) {
        mat.color.multiplyScalar(0.9);
      } else {
        this.scene.remove(obj);
        window.clearInterval(iv_id);
      }
    }, 500);
  }

  add_table() {
    let table_material = Physijs.createMaterial(
      new THREE.MeshLambertMaterial({
        map: this.texture_loader.load('texture/wood.jpg')
      }),
      .9, // high friction
      .2 // low restitution
    );
    table_material.map.wrapS = table_material.map.wrapT = THREE.RepeatWrapping;
    table_material.map.repeat.set(2, 2);

    const table_thickness = 0.03;
    let table = new Physijs.BoxMesh(
      new THREE.BoxGeometry(1, 1, table_thickness),
      table_material,
      0, // mass
      {
        restitution: .2,
        friction: .8
      }
    );
    table.position.z = -table_thickness / 2;
    table.receiveShadow = true;
    this.scene.add(table);
  }

  // Create a tile with center at (0, 0, 0), and parallel to XY plane.
  //   /|
  // /  |
  // \  |
  //  \|
  // --------->X
  create_tile() {
    let tile_material = Physijs.createMaterial(
      new THREE.MeshLambertMaterial({
        map: this.texture_loader.load('texture/plastic.jpg')
      }),
      .7 /* friction */ ,
      .3 /* restitution */
    );
    let core_geom = new THREE.BoxGeometry(0.02, 0.02, 0.02);
    let core = new Physijs.BoxMesh(core_geom, tile_material);
    core.userData = {
      "cube": true,
      "size": 0.02,
    };
    return core;
  }

  update_projection() {
    //this.renderer.setSize($('#viewport').width(), $('#viewport').height());
    this.camera.aspect = 400 / 600; // $('#viewport').width() / $('#viewport').height();
    this.camera.updateProjectionMatrix();
  }

  /* UI Utils */
  animate() {
    // note: three.js includes requestAnimationFrame shim
    let _this = this;
    requestAnimationFrame(function () {
      _this.animate();
    });
    this.scene.simulate();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

let client = new View3DClient();
client.animate();

setup_swarm();
