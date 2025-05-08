import p5 from "p5";
// ------------------- Graph Class -------------------
class Graph {
  constructor() {
    this.edges = new Map();
    this.positions = new Map();
  }

  addNode(label, x, y) {
    this.positions.set(label, { x, y });
    this.edges.set(label, []);
  }

  addEdge(from, to, cost) {
    this.edges.get(from).push({ to, cost });
    this.edges.get(to).push({ to: from, cost });
  }

  getNeighbors(node) {
    return this.edges.get(node) || [];
  }

  distance(from, to) {
    const a = this.positions.get(from);
    const b = this.positions.get(to);
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  shortestPath(start, end) {
    const distMap = new Map();
    const prev = new Map();
    const pq = new Set(this.edges.keys());

    for (let node of pq) distMap.set(node, Infinity);
    distMap.set(start, 0);

    while (pq.size > 0) {
      let u = Array.from(pq).reduce((a, b) =>
        distMap.get(a) < distMap.get(b) ? a : b,
      );
      pq.delete(u);
      if (u === end) break;

      const sortedNeighbors = this.getNeighbors(u)
        .slice()
        .sort((a, b) => a.cost - b.cost);
      for (const { to, cost } of sortedNeighbors) {
        if (!pq.has(to)) continue;
        const alt = distMap.get(u) + cost;
        if (alt < distMap.get(to)) {
          distMap.set(to, alt);
          prev.set(to, u);
        }
      }
    }

    const path = [];
    let u = end;
    while (prev.has(u)) {
      path.unshift(u);
      u = prev.get(u);
    }
    if (u === start) path.unshift(start);
    return { path, cost: distMap.get(end) };
  }
}

class Bus {
  constructor(id, location) {
    this.id = id;
    this.location = location;
    this.destinations = [];
    this.passengers = [];
    this.route = [];
    this.currentTarget = null;
    this.progress = 0;
    this.exactPos = null;
    this.capacity = 15;
  }

  simulateETAWithRoute(graph, start, destinations) {
    let totalTime = 0;
    let timeMap = new Map();
    let current = start;
    for (const dest of destinations) {
      const { cost } = graph.shortestPath(current, dest);
      totalTime += cost;
      timeMap.set(dest, totalTime);
      current = dest;
    }
    return timeMap;
  }

  evaluateRequestCostImpact(graph, request, currentTime) {
    if (this.passengers.length >= this.capacity) {
      return { accepted: false };
    }
    let existingPickup = this.destinations.indexOf(request.from);
    let existingDropoff = this.destinations.indexOf(request.to, existingPickup);
    if (existingPickup < existingDropoff && existingPickup >= 0) {
      return {
        accepted: true,
        plan: {
          insertPickup: existingPickup,
          insertDropoff: existingDropoff,
          destinations: this.destinations,
        },
        cost: 0,
      };
    }

    let bestTotalCost = Infinity;
    let bestPlan = null;

    for (let i = 0; i <= this.destinations.length; i++) {
      for (let j = i + 1; j <= this.destinations.length + 1; j++) {
        const newDestList = this.destinations.slice();
        newDestList.splice(i, 0, request.from);
        newDestList.splice(j, 0, request.to);

        const timeMap = this.simulateETAWithRoute(
          graph,
          this.location,
          newDestList,
        );

        let violates = false;
        let delayCost = 0;
        for (const p of this.passengers) {
          const newETA = timeMap.get(p.to);
          const oldETA = p.expectedArrivalTime - currentTime;
          const delay = newETA - oldETA;
          if (newETA / oldETA > 1.3 && delay > 10) {
            violates = true;
            break;
          }
          if (delay > 0) {
            delayCost += delay;
          }
        }

        if (!violates) {
          // reconsider this, totalCost should be the extra cost happen when we pickup this request
          // totalCost should be 0 if the request happen to be alreay on the destinations
          const etaNewRequest = timeMap.get(request.to);
          const totalCost = etaNewRequest + delayCost;
          if (totalCost < bestTotalCost) {
            bestTotalCost = totalCost;
            bestPlan = {
              insertPickup: i,
              insertDropoff: j,
              destinations: newDestList,
            };
          }
        }
      }
    }

    if (bestPlan) {
      return {
        accepted: true,
        plan: bestPlan,
        cost: bestTotalCost,
      };
    }
    return { accepted: false };
  }

  applyRequest(graph, request, plan, currentTime) {
    this.destinations = plan.destinations;
    const timeMap = this.simulateETAWithRoute(
      graph,
      this.location,
      this.destinations,
    );
    const eta = timeMap.get(request.to) + currentTime;
    this.passengers.push({ to: request.to, expectedArrivalTime: eta });
  }

  update(graph, p) {
    if (!this.exactPos) {
      const pos = graph.positions.get(this.location);
      this.exactPos = p.createVector(pos.x, pos.y);
    }

    if (this.route.length === 0 && this.destinations.length > 0) {
      if (this.location === this.destinations[0]) {
        this.passengers = this.passengers.filter((p) => p.to !== this.location);
        this.destinations.shift();
        return;
      }
      this.route = graph.shortestPath(this.location, this.destinations[0]).path;
      this.route.shift();
      if (this.route.length > 0) {
        this.currentTarget = this.route[0];
      }
    }

    if (this.route.length > 0) {
      const targetPos = graph.positions.get(this.currentTarget);
      const targetVec = p.createVector(targetPos.x, targetPos.y);
      const dir = p5.Vector.sub(targetVec, this.exactPos);

      if (dir.mag() <= 5) {
        this.exactPos = targetVec.copy();
        this.location = this.currentTarget;
        this.route.shift();
        if (this.route.length > 0) {
          this.currentTarget = this.route[0];
        } else {
          if (
            this.destinations.length > 0 &&
            this.location === this.destinations[0]
          ) {
            this.destinations.shift();
            this.passengers = this.passengers.filter(
              (p) => p.to !== this.location,
            );
          }
          this.currentTarget = null;
        }
      } else {
        dir.setMag(5);
        this.exactPos.add(dir);
      }
    }
  }

  draw(graph, p) {
    if (!this.exactPos) return;
    p.fill("blue");
    p.ellipse(this.exactPos.x, this.exactPos.y + 15, 10, 10);
    p.fill(0);
    p.textAlign(p.LEFT, p.BOTTOM);
    p.text(this.id, this.exactPos.x + 5, this.exactPos.y + 25);
  }
}

function assignRequestToBestBus(graph, buses, request, currentTime) {
  let bestBus = null;
  let bestPlan = null;
  let bestCost = Infinity;

  for (const bus of buses) {
    const bid = bus.evaluateRequestCostImpact(graph, request, currentTime);
    if (bid.accepted && bid.cost < bestCost) {
      bestCost = bid.cost;
      bestBus = bus;
      bestPlan = bid.plan;
    }
  }

  if (bestBus) {
    bestBus.applyRequest(graph, request, bestPlan, currentTime);
    return { accepted: true, busId: bestBus.id };
  }

  return { accepted: false };
}

// ------------------- P5.js Setup -------------------
let graph;
let buses = [];
let requests = [];
let labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
let currentTime = 0;
let isPaused = false;
let stepOnce = false;
let routeTable;
let requestTable;
let requestStage = 0;
let requestFrom = null;
let lastResolveTime = new Date();

const WIDTH = 800;
const HEIGHT = 600;
const PADDING = 100;
const NODES = labels.length;

const sketch = (p) => {
  p.setup = () => {
    p.createCanvas(WIDTH, HEIGHT);
    graph = new Graph();

    for (let i = 0; i < NODES; i++) {
      graph.addNode(
        labels[i],
        p.random(PADDING, WIDTH - PADDING),
        p.random(PADDING, HEIGHT - PADDING),
      );
    }

    for (let i = 0; i < NODES; i++) {
      for (let j = i + 1; j < NODES; j++) {
        const a = labels[i];
        const b = labels[j];
        const d = graph.distance(a, b);
        graph.addEdge(a, b, d);
      }
    }

    const addBusButton = p.createButton("Bus +1");
    addBusButton.position(10, 10);
    addBusButton.mousePressed(() => {
      const location = p.random(labels);
      buses.push(new Bus("bus" + buses.length, location));
    });

    const addReqButton = p.createButton("Request +1");
    addReqButton.position(100, 10);
    addReqButton.mousePressed(() => {
      let from = p.random(labels);
      let to;
      do {
        to = p.random(labels);
      } while (to === from);
      requests.push({ from, to });
    });
    const addReq10xButton = p.createButton("Request +10");
    addReq10xButton.position(200, 10);
    addReq10xButton.mousePressed(() => {
      let n = 10;
      while(n-- > 0) {
        let from = p.random(labels);
        let to;
        do {
          to = p.random(labels);
        } while (to === from);
        requests.push({ from, to });
      }
    });


    const stepButton = p.createButton("Step");
    stepButton.position(400, 10);
    stepButton.mousePressed(() => {
      if (isPaused) stepOnce = true;
    });
    stepButton.hide();

    const pausePlayButton = p.createButton("Pause");
    pausePlayButton.position(300, 10);
    pausePlayButton.mousePressed(() => {
      isPaused = !isPaused;
      pausePlayButton.html(isPaused ? "Play" : "Pause");
      if (isPaused) {
        stepButton.show();
      } else {
        stepButton.hide();
      }
    });

    routeTable = p.createElement("table");
    routeTable.position(10, HEIGHT + 20);
    routeTable.id("routeTable");
    requestTable = p.createElement("table");
    requestTable.position(600, HEIGHT + 20);
    requestTable.id("requestTable");
  };

  p.draw = () => {
    drawUnresolvedRequests();
    if (isPaused && !stepOnce) return;
    stepOnce = false;

    p.background(255);

    p.stroke(200);
    for (let [from, neighbors] of graph.edges) {
      const a = graph.positions.get(from);
      for (let { to } of neighbors) {
        const b = graph.positions.get(to);
        p.line(a.x, a.y, b.x, b.y);
      }
    }

    p.noStroke();
    p.textSize(20);
    p.textStyle(p.BOLD);
    for (let [label, pos] of graph.positions) {
      if (label == requestFrom) {
        p.fill(120)
      } else {
        p.fill(0)
      }
      p.ellipse(pos.x, pos.y, 30, 30);
      if (requests.some(e => e.from == label)) {
        p.fill(0xff, 0xf3, 0x80);
      } else {
        p.fill(255);
      }
      p.textAlign(p.CENTER, p.CENTER);
      p.text(label, pos.x, pos.y);
    }

    p.textSize(10);
    p.textStyle(p.NORMAL);

    resolveRequests();

    for (let bus of buses) {
      bus.update(graph, p);
      bus.draw(graph, p);
    }

    updateRouteTable();

    currentTime += 1;
  };

  function resolveRequests() {
    let now = new Date();
    if (now.getTime() - lastResolveTime.getTime() < 500) {
      return;
    }
    lastResolveTime = now;
    for (let i = requests.length - 1; i >= 0; i--) {
      const result = assignRequestToBestBus(
        graph,
        buses,
        requests[i],
        currentTime,
      );
      if (result.accepted) {
        requests.splice(i, 1);
      }
    }
  }

  function drawUnresolvedRequests() {
    requestTable.html("");
    const header = p.createElement("tr");
    header.child(p.createElement("th", "Request"));
    requestTable.child(header);
    for (const req of requests) {
      const row = p.createElement("tr");
      row.child(p.createElement("td", req.from + " → " + req.to));
      requestTable.child(row);
    }
  }

  function updateRouteTable() {
    routeTable.html("");
    const header = p.createElement("tr");
    header.child(p.createElement("th", "Bus ID"));
    header.child(p.createElement("th", "Route"));
    routeTable.child(header);

    for (const bus of buses) {
      const row = p.createElement("tr");
      row.child(p.createElement("td", bus.id));
      row.child(p.createElement("td", bus.destinations.join(" → ")));
      routeTable.child(row);
    }
  }

  p.mousePressed = () => {
    for (let [label, pos] of graph.positions) {
      if (p.dist(p.mouseX, p.mouseY, pos.x, pos.y) < 10) {
        if (requestStage === 0) {
          requestFrom = label;
          requestStage = 1;
          console.log("request from ", requestFrom);
        } else if (requestStage === 1) {
          if (label !== requestFrom) {
            console.log("request from ", requestFrom, "to", label);
            requests.push({ from: requestFrom, to: label });
          }
          requestStage = 0;
          requestFrom = null;
        }
        break;
      }
    }
  };
};

new p5(sketch);
