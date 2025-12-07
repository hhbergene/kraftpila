// tasks.js - Minimal JS task specification (Task 1 only for now)
(function(){
  // Global fallbacks
  const WIDTH = window.WIDTH || 1000;
  const HEIGHT = window.HEIGHT || 640;
  const GRID_STEP = window.GRID_STEP || 20;
  const DRAW_CENTER = [ (WIDTH/2), (HEIGHT/2) + GRID_STEP*2 ];

  // Direction unit vectors (screen coordinate system: y down)
  const UP    = [0,-1];
  const DOWN  = [0, 1];
  const LEFT  = [-1,0];
  const RIGHT = [1,0];

  function norm(v){ return geometry.length(v); }
  function unit(v){ const n=norm(v); return n>1e-6? [v[0]/n,v[1]/n]:[0,0]; }
  function planeNormalFromAngle(angleDeg){
    const a = angleDeg * Math.PI/180;
    // Python logic: nx=-sin(a), ny=-cos(a) (y down)
    return unit([-Math.sin(a), -Math.cos(a)]);
  }
  function planeTangentFromAngle(angleDeg){
    const a = angleDeg * Math.PI/180;
    // Python logic tangent t = (cos(a), -sin(a))
    return unit([Math.cos(a), -Math.sin(a)]);
  }
  function tangentFromNormal(n){ return unit([-n[1], n[0]]); }

  /* Lightweight Task model (extended):
     task = {
       id, title,
       origin: [x, y],  // Reference point for force anchors (center of primary object)
       scene: { plane:{angleDeg|n_vec, through}, rects:[{width,height,bottomCenter, angleDeg|n_vec}], segments:[], circles:[], ellipses:[], arrows:[], texts:[] },
       expectedForces: [ { name, aliases[], dir:[dx,dy], anchor:{ type:'point'|'segment', ref:'origin'|'rect<i>', point:'center'|'top_center'|..., segment:'bottom'|'top' } } ],
       initialForces: [ { name, anchor:[x,y], arrowBase:[x,y], arrowTip:[x,y] } ],
       relations: [ { lhs:[{name, component?}], rhs:[{name, component?}], ratio, tol_rel } ]
     }
  */

  const TASKS = [];

  const wA = GRID_STEP * 8;
  const hA = GRID_STEP * 6;
  const text_top_y = GRID_STEP * 4; // Top y-coordinate for text lines
  const text_top_x = DRAW_CENTER[0]*3/4; // Centered position of text lines
  const text_spacing = 22; // Vertical spacing between text lines
  
  // --- Task Intro 1 ---
  TASKS.push({
    "id": "Intro 1",
    "title": "Tegn tyngdekraften på en fallende ball",
    "category": "Fysikk 1",
    "origin": [
      500,
      240
    ],
    "help_lines": [
      "På en ball som ligger i ro på bakken virker det to krefter:",
      "G - Tyngdekraften",
      "N - Normalkraften fra underlaget",
      "Normalkraften er også en kontaktkraft.",
      "Legg merke til at vi har forskjøvet tyngdekraften litt til side for angrepspunktet slik at den ikke skal overlappe med normalkraften",
      "Tegn normakraften. Prøv gjerne å forskyve den litt til siden."
    ],
    "scene": {
      "plane": {
        "angleDeg": 0,
        "through": [
          500,
          480
        ],
        "draw": true,
        "snapping": false,
        "n_vec": [
          0,
          -1
        ],
        "t_vec": [
          1,
          0
        ]
      },
      "ellipses": [
        {
          "width": 120,
          "height": 120,
          "center": [
            500,
            240
          ],
          "n_vec": [
            0,
            -1
          ],
          "snapping": true,
          "t_vec": [
            1,
            0
          ]
        }
      ],
      "texts": [
        {
          "txt": "Trykk på Oppgave-knappen over for flere detaljer",
          "pos": [
            440,
            20
          ],
          "size": 14,
          "align": "right",
          "color": "#222",
          "snapping": false,
          "_renderedPos": [
            440,
            20
          ]
        },
        {
          "txt": "Tegn inn tyngdekraften G.",
          "pos": [
            240,
            80
          ],
          "size": 14,
          "align": "left",
          "color": "#222",
          "snapping": false,
          "_renderedPos": [
            240,
            80
          ]
        },
        {
          "txt": "- Klikk i ballens sentrum og dra rett ned.",
          "size": 14,
          "align": "left",
          "color": "#222",
          "snapping": false,
          "_renderedPos": [
            240,
            99
          ]
        },
        {
          "txt": "- Husk å navngi kraften.",
          "size": 14,
          "align": "left",
          "color": "#222",
          "snapping": false,
          "_renderedPos": [
            240,
            118
          ]
        },
        {
          "txt": "Trykk på Sjekk-knappen før du går til neste oppgave",
          "pos": [
            480,
            20
          ],
          "size": 14,
          "align": "left",
          "color": "#222",
          "snapping": false,
          "_renderedPos": [
            480,
            20
          ],
          "linked": false
        },
        {
          "txt": "v",
          "pos": [
            340,
            240
          ],
          "size": 14,
          "align": "center",
          "color": "#222",
          "snapping": false,
          "_renderedPos": [
            340,
            240
          ]
        }
      ],
      "arrows": [
        {
          "a": [
            360,
            220
          ],
          "b": [
            360,
            260
          ],
          "snapping": false
        }
      ]
    },
    "expectedForces": [
      {
        "name": "G",
        "aliases": [
          "g",
          "ga",
          "tyngde",
          "fg",
          "G"
        ],
        "dir": [
          0,
          1
        ],
        "anchor": {
          "type": "point",
          "ref": "origin",
          "point": "center"
        }
      }
    ],
    "initialForces": [],
    "sumF": {},
    "relations": []
  });

  TASKS.push({
    "id": "Test export",
    "title": "Tegn snordraget på ballen",
    "category": "Fysikk 1",
    "origin": [500,240],
    "help_lines": ["På en ball som ligger i ro på bakken virker det to krefter:","G - Tyngdekraften","N - Normalkraften fra underlaget","Normalkraften er også en kontaktkraft.","Legg merke til at vi har forskjøvet tyngdekraften litt til side for angrepspunktet slik at den ikke skal overlappe med normalkraften","Tegn normakraften. Prøv gjerne å forskyve den litt til siden."],
    "scene": {
      "plane": {
        "angleDeg": 0,
        "through": [499,499.6666660308838],
        "draw": true,
        "snapping": false,
        "n_vec": [0,-1],
        "t_vec": [1,0]
      },
      "ellipses": [
        {
          "width": 120,
          "height": 120,
          "center": [500,240],
          "n_vec": [0,-1],
          "t_vec": [1,0],
          "snapping": true
        }
      ],
      "texts": [
        {
          "txt": "Snordraget S er en kontaktkraft",
          "pos": [200,57],
          "size": 14,
          "align": "left",
          "color": "#222",
          "snapping": false
        },
        {
          "txt": "G og S må være motsatt rettet og like lange for at",
          "pos": [200,76],
          "size": 14,
          "align": "left",
          "color": "#222",
          "snapping": false
        },
        {
          "txt": "Newtons 1. lov \\sumF=0 skal være sann.",
          "pos": [200,95],
          "size": 14,
          "align": "left",
          "color": "#222",
          "snapping": false
        },
        {
          "txt": "-Tegn snordraget",
          "pos": [200,114],
          "size": 14,
          "align": "left",
          "color": "#222",
          "snapping": false
        }
      ],
      "segments": [
        {
          "a": [500,180],
          "b": [500,40],
          "snapping": false,
          "color": "#aaa7a7",
          "lineWidth": 3
        }
      ],
      "rects": [
        {
          "width": 520,
          "height": 20,
          "bottomCenter": [740,40],
          "angleDeg": 0,
          "n_vec": [0,-1],
          "t_vec": [1,0],
          "snapping": false,
          "color": "#acadaf"
        }
      ]
    },
    "expectedForces": [],
    "initialForces": [],
    "sumF": {},
    "relations": [
      {
        "lhs": [
          {
            "name": "G"
          }
        ],
        "rhs": [
          {
            "name": "S"
          }
        ],
        "ratio": 1,
        "tol_rel": 0.15
      }
    ]
  });

  TASKS.push({
    "id": "Intro 3",
    "title": "Tegn normalkraften fra underlaget",
    "category": "Fysikk 1",
    "origin": [
      500,
      240
    ],
    "help_lines": [
      "På en ball som ligger i ro på bakken virker det to krefter:",
      "G - Tyngdekraften",
      "N - Normalkraften fra underlaget",
      "Normalkraften er også en kontaktkraft.",
      "Legg merke til at vi har forskjøvet tyngdekraften litt til side for angrepspunktet slik at den ikke skal overlappe med normalkraften",
      "Tegn normakraften. Prøv gjerne å forskyve den litt til siden."
    ],
    "scene": {
      "plane": {
        "angleDeg": 0,
        "through": [
          500,
          340
        ],
        "draw": true,
        "snapping": false,
        "n_vec": [
          0,
          -1
        ],
        "t_vec": [
          1,
          0
        ]
      },
      "ellipses": [
        {
          "width": 120,
          "height": 120,
          "center": [
            500,
            280
          ],
          "n_vec": [
            0,
            -1
          ],
          "t_vec": [
            1,
            0
          ],
          "snapping": true
        }
      ],
      "texts": [
        {
          "txt": "Snordraget S er en kontaktkraft",
          "pos": [
            200,
            57
          ],
          "size": 14,
          "align": "left",
          "color": "#222",
          "snapping": false,
          "_renderedPos": [
            200,
            57
          ]
        },
        {
          "txt": "G og S må være motsatt rettet og like lange for at",
          "size": 14,
          "align": "left",
          "color": "#222",
          "snapping": false,
          "_renderedPos": [
            200,
            76
          ]
        },
        {
          "txt": "Newtons 1. lov \\sumF=0 skal være sann.",
          "size": 14,
          "align": "left",
          "color": "#222",
          "snapping": false,
          "_renderedPos": [
            200,
            95
          ]
        },
        {
          "txt": "-Tegn snordraget",
          "size": 14,
          "align": "left",
          "color": "#222",
          "snapping": false,
          "_renderedPos": [
            200,
            114
          ]
        }
      ],
      "segments": [],
      "rects": []
    },
    "expectedForces": [
      {
        "name": "G",
        "aliases": [
          "g",
          "ga",
          "tyngde",
          "fg",
          "G"
        ],
        "dir": [
          0,
          1
        ],
        "anchor": {
          "type": "point",
          "ref": "ellipse0",
          "point": "center"
        }
      }
    ],
    "initialForces": [],
    "sumF": {},
    "relations": [
      {
        "lhs": [
          {
            "name": "G"
          }
        ],
        "rhs": [
          {
            "name": "N"
          }
        ],
        "ratio": 1,
        "tol_rel": 0.15
      }
    ]
  });

  // --- Task 1 ---
  TASKS.push({
    id: '1',
    title: 'Kloss på flatt plan uten friksjon',
    category: 'Fysikk 1',
    origin: [DRAW_CENTER[0], DRAW_CENTER[1]], // Bottom center of rectangle
    help_lines: ['En kloss A ligger i ro på et flatt underlag.','Tegn kreftene som virker på klossen.'],
    scene: {
      plane: { angleDeg: 0, through: DRAW_CENTER.slice(), draw:true, snapping:false },
      rects: [ { width: wA, height: hA, bottomCenter: DRAW_CENTER.slice(), angleDeg: 0, snapping:true } ],
      texts: [
        { txt: 'Tegn kreftene som virker på A.', pos: [text_top_x, text_top_y], size: 14, align: 'center', color: '#222', snapping: false },
        { txt: 'v=0 (konstant)', pos: [text_top_x, text_top_y + text_spacing], size: 14, align: 'center', color: '#222', snapping: false },
        { txt: 'A', pos: [DRAW_CENTER[0]-wA/2+ text_spacing, DRAW_CENTER[1] - text_spacing], size: 14, align: 'center', color: '#222', snapping: false },
      ]
    },
    expectedForces: [
      { name:'G', aliases:['g','ga','tyngde','fg','G'], dir: DOWN.slice(), anchor:{ type:'point', ref:'rect0', point:'center'} },
      { name:'N', aliases:['n','na','normalkraft','r','fn','N'], dir: UP.slice(), anchor:{ type:'segment', ref:'rect0', segment:'bottom'} }
    ],
    initialForces: [],
    sumF: { x: 0, y: 0 },
    relations: [ { lhs:[{name:'G'}], rhs:[{name:'N'}], ratio:1.0, tol_rel:0.15 } ]
  });

  // --- Task 2 ---
  TASKS.push({
    id: '2',
    title: 'Vi drar en kloss med kraften F',
    category: 'Fysikk 1',
    help_lines: ['En kloss A ligger på et flatt underlag med friksjon og trekkes av en kraft F,','slik at den beveger seg mot høyre med konstant fart.','Tegn kreftene som virker på klossen.'],
    scene: {
      plane: { angleDeg: 0, through: DRAW_CENTER.slice(), draw:true, snapping:false },
      rects: [ { width: wA, height: hA, bottomCenter: DRAW_CENTER.slice(), angleDeg: 0, snapping:true } ],
      arrows: [ { a:[DRAW_CENTER[0]-GRID_STEP*2, DRAW_CENTER[1]-hA*1.8], b:[DRAW_CENTER[0]+GRID_STEP*2, DRAW_CENTER[1]-hA*1.8], snapping:false } ],
      texts: [
        { txt: 'Tegn de andre kreftene som virker på A.', pos: [text_top_x, text_top_y], size: 14, align: 'center', color: '#222', snapping: false },
        { txt: 'v = konstant', pos: [DRAW_CENTER[0], DRAW_CENTER[1]-hA*1.8- text_spacing] , size: 14, align: 'center', color: '#222', snapping: false },
        { txt: 'A', pos: [DRAW_CENTER[0]-wA/2+ text_spacing, DRAW_CENTER[1] - text_spacing], size: 14, align: 'center', color: '#222', snapping: false },
      ]
    },
    expectedForces: [
      { name:'F', aliases:['f','fa','kraft','applied'], dir: RIGHT.slice(), anchor:{ type:'segment', ref:'rect0', segment:'right'} },
      { name:'G', aliases:['g','ga','tyngde','fg'], dir: DOWN.slice(), anchor:{ type:'point', ref:'rect0', point:'center'} },
      { name:'N', aliases:['n','na','normalkraft','r','fn'], dir: UP.slice(), anchor:{ type:'segment', ref:'rect0', segment:'bottom'} },
      { name:'R', aliases:['r','ra','friksjon','fr'], dir: LEFT.slice(), anchor:{ type:'segment', ref:'rect0', segment:'bottom'} },
    ],
    initialForces: [ // Pre-drawn F on right middle
      { name:'F', anchorFrom:'rect0', point:'right_middle', len: GRID_STEP*3, dir: RIGHT.slice() }
    ],
    sumF: { x: 0, y: 0 },
    relations: [
      { lhs:[{name:'G'}], rhs:[{name:'N'}], ratio:1.0, tol_rel:0.15 },
      { lhs:[{name:'F'}], rhs:[{name:'R'}], ratio:1.0, tol_rel:0.15 }
    ]
  });

  // --- Task 3 (two rectangles) ---
  TASKS.push({
    id: '3',
    title: 'To klosser oppå hverandre i ro',
    category: 'Fysikk 1',
    help_lines: ['To klosser A og B ligger i ro på et flatt underlag.','Kloss A er dobbelt så tung som kloss B (m_A = 2 · m_B).','Tegn kreftene som virker på kloss A.','Kreftene som virker på kloss B er allerede tegnet.'],
    scene: {
      plane: { angleDeg:0, through: DRAW_CENTER.slice(), draw:true, snapping:false },
      rects: [
        { width: wA, height: hA, bottomCenter: DRAW_CENTER.slice(), angleDeg:0, snapping:true }, // A
        { width: hA, height: GRID_STEP*4, bottomCenter: null, angleDeg:0, snapping:true } // B (bottomCenter resolved after load)
      ],
      texts: [
        { txt: 'Tegn kreftene som virker på A.', pos: [text_top_x, text_top_y], size: 14, align: 'center', color: '#222', snapping: false },
        { txt: 'v = 0', pos: [text_top_x, text_top_y + text_spacing], size: 14, align: 'center', color: '#222', snapping: false },
        { txt: 'm_A = 2 · m_B', pos: [text_top_x, text_top_y + text_spacing * 2], size: 14, align: 'center', color: '#222', snapping: false },
        { txt: 'A', pos: [DRAW_CENTER[0]-wA/2+ text_spacing, DRAW_CENTER[1] - text_spacing], size: 14, align: 'center', color: '#222', snapping: false },
        { txt: 'B', pos: [DRAW_CENTER[0]-hA/2+ text_spacing, DRAW_CENTER[1]-hA - text_spacing], size: 14, align: 'center', color: '#222', snapping: false },
      ]
    },
    expectedForces: [
      { name:'G', aliases:['g','ga','fg','tyngde'], dir: DOWN.slice(), anchor:{ type:'point', ref:'rect0', point:'center'} },
      { name:'N', aliases:['n','na','fn','normalkraft','r'], dir: UP.slice(), anchor:{ type:'segment', ref:'rect0', segment:'bottom'} },
      { name:'N_B', aliases:['nb*','n*','nb\'','n\'','b','nba','nab'], dir: DOWN.slice(), anchor:{ type:'segment', ref:'rect0', segment:'top'} }
    ],
    initialForces: [],
    sumF: { x: 0, y: 0 },
    relations: [
      { lhs:[{name:'G'},{name:'N_B'}], rhs:[{name:'N'}], ratio:1.0, tol_rel:0.15 },
      { lhs:[{name:'G'}], rhs:[{name:'N_B'}], ratio:2.0, tol_rel:0.15 }
    ]
  });

  // --- Task 4 (inclined plane frictionless) ---
  TASKS.push((()=> {
    // Local vectors for Task 4
    const n_vec = unit([-1,-2]);
    const t_vec = unit([2,-1]);
    return {
      id: '4',
      title: 'Kloss på skråplan',
      category: 'Fysikk 2',
      help_lines: ['Kloss A sklir nedover et skråplan uten friksjon.','Tegn kreftene som virker på klossen.'],
      scene: {
        plane: { n_vec, through: DRAW_CENTER.slice(), draw:true, snapping:false },
        rects: [ { width: wA, height: hA, bottomCenter: DRAW_CENTER.slice(), n_vec, snapping:true } ],
        arrows: [ { a:[DRAW_CENTER[0]+(wA/4)*t_vec[0]+(hA*1.5)*n_vec[0], DRAW_CENTER[1]+(wA/4)*t_vec[1]+(hA*1.5)*n_vec[1]], 
                    b:[DRAW_CENTER[0]-(wA/4)*t_vec[0]+(hA*1.5)*n_vec[0], DRAW_CENTER[1]-(wA/4)*t_vec[1]+(hA*1.5)*n_vec[1]], snapping:false } ],
        texts: [
          { txt: 'Tegn kreftene som virker på A.', pos: [text_top_x, text_top_y], size: 14, align: 'center', color: '#222', snapping: false },
          { txt: 'μ = 0', pos: [text_top_x, text_top_y + text_spacing], size: 14, align: 'center', color: '#222', snapping: false },
          { txt: 'v', pos: [DRAW_CENTER[0]+(hA*1.5+text_spacing)*n_vec[0], DRAW_CENTER[1]+(hA*1.5+text_spacing)*n_vec[1]], size: 14, align: 'center', color: '#222', snapping: false, n_vec }, // Rotated text
          { txt: 'A', pos: [DRAW_CENTER[0]-(wA/2-text_spacing)*t_vec[0]+(text_spacing)*n_vec[0], DRAW_CENTER[1]-(wA/2-text_spacing)*t_vec[1]+(text_spacing)*n_vec[1] ], size: 14, align: 'center', color: '#222', snapping: false },
        ]
      },
      expectedForces: [
        { name:'G', aliases:['g','ga','tyngde','fg','G'], dir: DOWN.slice(), anchor:{ type:'point', ref:'rect0', point:'center'} },
        { name:'N', aliases:['n','na','normalkraft','r','fn','N'], dir: 'planeNormal', anchor:{ type:'segment', ref:'rect0', segment:'bottom'} },
      ],
      initialForces: [],
      sumF: { n: 0 },
      relations: [ { lhs:[{name:'G', component:'normal'}], rhs:[{name:'N'}], ratio:1.0, tol_rel:0.15 } ]
    };
  })());

  // --- Task 5 (inclined with friction) ---
  TASKS.push((()=> {
    // Local vectors for Task 5
    const n_vec = unit([-1,-2]);
    const t_vec = unit([2,-1]);
    return {
      id: '5',
      title: 'Kloss på skråplan med friksjon',
      category: 'Fysikk 2',
      help_lines: ['En kloss A sklir nedover et skråplan med konstant fart.','Tegn kreftene som virker på klossen.'],
      scene: {
        plane: { n_vec, through: DRAW_CENTER.slice(), draw:true, snapping:false },
        rects: [ { width: wA, height: hA, bottomCenter: DRAW_CENTER.slice(), n_vec, snapping:true } ],
        arrows: [ { a:[DRAW_CENTER[0]+(wA/4)*t_vec[0]+(hA*1.5)*n_vec[0], DRAW_CENTER[1]+(wA/4)*t_vec[1]+(hA*1.5)*n_vec[1]], 
                    b:[DRAW_CENTER[0]-(wA/4)*t_vec[0]+(hA*1.5)*n_vec[0], DRAW_CENTER[1]-(wA/4)*t_vec[1]+(hA*1.5)*n_vec[1]], snapping:false } ],
        texts: [
          { txt: 'Tegn kreftene som virker på A.', pos: [text_top_x, text_top_y], size: 14, align: 'center', color: '#222', snapping: false },
          { txt: 'v = konstant', pos: [DRAW_CENTER[0]+(hA*1.5+text_spacing)*n_vec[0], DRAW_CENTER[1]+(hA*1.5+text_spacing)*n_vec[1]], size: 14, align: 'center', color: '#222', snapping: false, n_vec }, // Rotated text
          { txt: 'A', pos: [DRAW_CENTER[0]-(wA/2-text_spacing)*t_vec[0]+(text_spacing)*n_vec[0], DRAW_CENTER[1]-(wA/2-text_spacing)*t_vec[1]+(text_spacing)*n_vec[1] ], size: 14, align: 'center', color: '#222', snapping: false },
        ]
      },
      expectedForces: [
        { name:'G', aliases:['g','ga','tyngde','fg','G'], dir: DOWN.slice(), anchor:{ type:'point', ref:'rect0', point:'center'} },
        { name:'N', aliases:['n','na','normalkraft','r','fn','N'], dir:'planeNormal', anchor:{ type:'segment', ref:'rect0', segment:'bottom'} },
        { name:'R', aliases:['r','ra','friksjonskraft','R'], dir:'planeTangent', anchor:{ type:'segment', ref:'rect0', segment:'bottom'} },
      ],
      initialForces: [],
      relations: [
        { lhs:[{name:'G', component:'normal'}], rhs:[{name:'N'}], ratio:1.0, tol_rel:0.15 },
        { lhs:[{name:'G', component:'tangent'}], rhs:[{name:'R'}], ratio:1.0, tol_rel:0.15 }
      ],
      sumF: { n: 0, t: 0 }
    };
  })());

  // --- Task 6 - Bil i horisontal sving med friksjon ---
  TASKS.push({
    id: '6',
    title: 'Bil i sving med friksjon',
    category: 'Fysikk 2',
    help_lines: ['En bil kjører mot oss med konstant banefart i en sving med sentrum mot venstre.','Tegn kreftene som virker på bilen.'],
    scene: {
      plane: { angleDeg:0, through: [DRAW_CENTER[0], DRAW_CENTER[1]+hA], draw:true, snapping:false },
      rects: [ { width: wA, height: hA, bottomCenter: [DRAW_CENTER[0]+wA, DRAW_CENTER[1]+hA], angleDeg:0, snapping:true } ],
      segments: [ { a:[DRAW_CENTER[0], DRAW_CENTER[1]+hA+2], b:[DRAW_CENTER[0] + 2*wA, DRAW_CENTER[1]+hA+2], snapping:false } ],
      arrows: [ { a:[DRAW_CENTER[0]+wA, DRAW_CENTER[1]+hA*1.5], b:[DRAW_CENTER[0]+GRID_STEP*10 - GRID_STEP*20, DRAW_CENTER[1]+hA*1.5], body:'dashed', snapping:false } ],
      texts: [
        { txt: 'Tegn kreftene som virker på bilen.', pos: [text_top_x, text_top_y], size: 14, align: 'center', color: '#222', snapping: false },
        { txt: '|v| = konstant', pos: [text_top_x, text_top_y + text_spacing], size: 14, align: 'center', color: '#222', snapping: false },
        { txt:'Til sentrum av sirkelbevegelsen', pos:[DRAW_CENTER[0], DRAW_CENTER[1]+hA*1.5+GRID_STEP/2], size:12, align:'center', color:'#00f', snapping:false }
      ]
    },
    expectedForces: [
      { name:'G', aliases:['g','ga','tyngde','fg','G'], dir: DOWN.slice(), anchor:{ type:'point', ref:'rect0', point:'center'} },
      { name:'N', aliases:['n','na','normalkraft','r','fn','N'], dir: UP.slice(), anchor:{ type:'segment', ref:'rect0', segment:'bottom'} },
      { name:'R', aliases:['r','ra','friksjonskraft','R'], dir: LEFT.slice(), anchor:{ type:'segment', ref:'rect0', segment:'bottom'} }
    ],
    initialForces: [],
    sumF: { y: 0 },
    relations: [ { lhs:[{name:'G', component:'normal'}], rhs:[{name:'N', component:'normal'}], ratio:1.0, tol_rel:0.15 } ]
  });

  // --- Task 7 (banked curve frictionless) ---
  TASKS.push((()=> {
    // Local vectors and bases for Task 7
    const n_vec = unit([-1,-3]);
    const t_vec = unit([3,-1]);
    const bottomCenter = [DRAW_CENTER[0]+GRID_STEP*10, DRAW_CENTER[1]];
    const leftBase  = [ bottomCenter[0] - t_vec[0]*wA*1.5, bottomCenter[1] - t_vec[1]*wA*1.5 ];
    const rightBase = [ bottomCenter[0] + t_vec[0]*wA*1.5, bottomCenter[1] + t_vec[1]*wA*1.5 ];
    return {
      id: '7',
      title: 'Bil i dossert sving uten friksjon',
      category: 'Fysikk 2',
      help_lines: ['En bil kjører mot oss med konstant banefart','i en dossert sving uten friksjon uten å skli.','Tegn kreftene som virker på bilen.'],
      scene: {
        plane: { n_vec, through: bottomCenter, draw:false, snapping:false },
        rects: [ { width: wA, height: hA, bottomCenter, n_vec, snapping:true } ],
        segments: [
          { a:[ leftBase[0] - wA*5, leftBase[1] ], b: leftBase, snapping:false },
          { a: leftBase, b: rightBase, snapping:false },
        ],
        arrows: [ { a:[DRAW_CENTER[0]+wA, DRAW_CENTER[1]+hA*1.5], b:[DRAW_CENTER[0]+GRID_STEP*10 - GRID_STEP*20, DRAW_CENTER[1]+hA*1.5], body:'dashed', snapping:false } ],
        texts: [
          { txt: 'Tegn kreftene som virker på bilen.', pos: [text_top_x, text_top_y], size: 14, align: 'center', color: '#222', snapping: false },
          { txt: '|v| = konstant', pos: [text_top_x, text_top_y + text_spacing], size: 14, align: 'center', color: '#222', snapping: false },
          { txt: 'μ = 0', pos: [text_top_x, text_top_y + text_spacing * 2], size: 14, align: 'center', color: '#222', snapping: false },
          { txt:'Til sentrum av sirkelbevegelsen', pos:[DRAW_CENTER[0], DRAW_CENTER[1]+hA*1.5+GRID_STEP/2], size:12, align:'center', color:'#00f', snapping:false }
        ]
      },
      expectedForces: [
        { name:'G', aliases:['g','ga','tyngde','fg','G'], dir: DOWN.slice(), anchor:{ type:'point', ref:'rect0', point:'center'} },
        { name:'N', aliases:['n','na','normalkraft','r','fn','N'], dir:'planeNormal', anchor:{ type:'segment', ref:'rect0', segment:'bottom'} }
      ],
      initialForces: [],
      sumF: { y: 0 },
      relations: [ { lhs:[{name:'N', component:'vertical'}], rhs:[{name:'G'}], ratio:1.0, tol_rel:0.15 } ]
    };
  })());

  // --- Post processing: resolve derived rectangle positions & plane vectors ---
  TASKS.forEach(task => {
    const plane = task.scene.plane;
    if(plane){
      if(plane.n_vec){ plane.n_vec = unit(plane.n_vec); plane.t_vec = tangentFromNormal(plane.n_vec); }
      else if(typeof plane.angleDeg === 'number'){ plane.n_vec = planeNormalFromAngle(plane.angleDeg); plane.t_vec = planeTangentFromAngle(plane.angleDeg); }
    }
    // Resolve rect positions (top rectangle in task3)
    if(task.scene.rects){
      task.scene.rects.forEach((r,i)=>{
        if(r.n_vec){ r.n_vec = unit(r.n_vec); r.t_vec = tangentFromNormal(r.n_vec); }
        else if(typeof r.angleDeg === 'number'){ r.n_vec = planeNormalFromAngle(r.angleDeg); r.t_vec = planeTangentFromAngle(r.angleDeg); }
      });
      // Task 3 second rect sits atop first
      if(task.id==='3' && task.scene.rects.length>=2){
        const A = task.scene.rects[0];
        const B = task.scene.rects[1];
        if(!B.bottomCenter){
          // bottomCenter_B = top of A (A.bottomCenter.y - A.height)
            B.bottomCenter = [A.bottomCenter[0], A.bottomCenter[1] - A.height];
        }
      }
    }
    // Resolve ellipse positions and directions
    if(task.scene.ellipses){
      task.scene.ellipses.forEach((e,i)=>{
        if(e.n_vec){ 
          e.n_vec = unit(e.n_vec); 
          e.t_vec = tangentFromNormal(e.n_vec);
        }
      });
    }
  });

  window.TASKS = TASKS;
})();
