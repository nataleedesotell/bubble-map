// https://observablehq.com/d/4d1c87b5243dc13e@1365
export default function define(runtime, observer) {
  const main = runtime.module();
  main.variable(observer()).define(["md"], function(md){return(
md`# Bubble Map`
)});
  main.variable(observer("spreadCounties")).define("spreadCounties", ["applySimulation","counties"], function(applySimulation,counties){return(
applySimulation(counties)
)});
  main.variable(observer("vote_map_animation")).define("vote_map_animation", ["width","d3","DOM","projection","counties","format","flubber"], function(width,d3,DOM,projection,counties,format,flubber)
{
  const height = width * 5/8;
  
  const svg = d3.select(DOM.svg(width, height))
      .attr("viewBox", "0 0 960 600")
      .style("width", "100%")
      .style("height", "auto");
  
  const color = d3.scaleSequential(d3.interpolateRdBu);
  
  // render map
  
  const path = d3.geoPath(projection);

   svg.append("g")
     .selectAll("path")
     .data(counties)
     .enter().append("path")
     .attr("class", "countyShape")
     .attr("fill", county => county.properties.votes.percent.dem > county.properties.votes.percent.gop ? "#0e0eb9" : "#ea0004")  
     .attr("d", path)
     .attr("stroke", "white")
     .attr("stroke-width", 0.5)
     .append("title")
     .text(d => [
        d.properties.name,
        `${format.percent(d.properties.votes.percent.dem)} Clinton`,
        `${format.percent(d.properties.votes.percent.gop)} Trump`,
        ].join(" – ")
      ) 
   
  setInterval(() => {
    svg.selectAll(".countyShape")
      .transition()
      .delay(d => d.rank*2)
      .duration(3000)
      .attrTween('d', function(d, i) {
        return flubber.toCircle(path(d), d.x, d.y, d.properties.radius, {maxSegmentLength: 2});
      })

    svg.selectAll(".countyShape")
      .transition()
      .delay(d => 5000 + d.rank*2)
      .duration(3000)
      .attrTween('d', function(d, i) {
        return flubber.fromCircle(d.x, d.y, d.properties.radius, path(d), {maxSegmentLength: 2});
      })
  }, 25000)

  return svg.node();
}
);
  main.variable(observer("maxRadius")).define("maxRadius", function(){return(
25
)});
  main.variable(observer("nodePadding")).define("nodePadding", function(){return(
0.1
)});
  main.variable(observer("counties")).define("counties", ["topojson","us","votes","populations","projection","turf","radiusScale"], function(topojson,us,votes,populations,projection,turf,radiusScale){return(
topojson.feature(us, us.objects.counties).features.map(county => {
  const { count, percent, two_party_ratio } = votes.find(v => v.id === county.id)
  const { population } = populations.find(p => p.id === county.id)
  
  const state = us.objects.states.geometries.find(state => state.id === county.properties.STATEFP);
  
  const name = `${county.properties.NAME} County, ${state.properties.name}`; 
  
  return {
    ...county,
    properties: {
      name,
      state: state.properties.name,
      votes: { count, percent, two_party_ratio },
      population,
      density: population / county.properties.ALAND * 1e6,
      centroid: projection(turf.centroid(county.geometry).geometry.coordinates),
      radius: radiusScale(population)
    }
  }
})
.filter(c => c.properties.centroid)
//.filter(c => c.geometry.type === "MultiPolygon")
.sort((a,b) => a.properties.centroid[0] < b.properties.centroid[0] ? -1 : 1)
.map((d, i) => {
  let geometry;
  if (d.geometry.type !== "MultiPolygon") { 
    geometry = d.geometry
  } else {
    geometry = {
      type: d.geometry.type,
      coordinates: d.geometry.coordinates.sort((a,b) => 
        turf.area(turf.polygon(a)) > turf.area(turf.polygon(b)) ? -1 : 1
      ).slice(0, 1)
    }
  }
  return {
    ...d, 
    rank: i, 
    geometry
  }  
 })
)});
  main.variable(observer("radiusScale")).define("radiusScale", ["d3","populations","maxRadius"], function(d3,populations,maxRadius)
{
  const populationMax = d3.max(populations, c => c.population)
  return d3.scaleSqrt()
    .domain([0, populationMax])
    .range([1, maxRadius]) 
}
);
  main.variable(observer("applySimulation")).define("applySimulation", ["d3","width","nodePadding"], function(d3,width,nodePadding){return(
(nodes) => {
  const simulation = d3.forceSimulation(nodes)
    .force("cx", d3.forceX().x(d => width / 2).strength(0.02))
    .force("cy", d3.forceY().y(d => width * (5/8) / 2).strength(0.02))
    .force("x", d3.forceX().x(d => d.properties.centroid ? d.properties.centroid[0] : 0).strength(0.3))
    .force("y", d3.forceY().y(d => d.properties.centroid ? d.properties.centroid[1] : 0).strength(0.3))
    .force("charge", d3.forceManyBody().strength(-1))
    .force("collide", d3.forceCollide().radius(d => d.properties.radius + nodePadding).strength(1))
    .stop()

  let i = 0; 
  while (simulation.alpha() > 0.01 && i < 200) {
    simulation.tick(); 
    i++;
    // console.log(`${Math.round(100*i/200)}%`)
  }

  return simulation.nodes();
}
)});
  main.variable(observer("format")).define("format", ["d3"], function(d3){return(
{
  density: (x) => x > 1000 ? d3.format(".2s")(x) : d3.format(".3r")(x),
  percent: d3.format(".1%")
}
)});
  main.variable(observer("projection")).define("projection", ["d3","topojson","us"], function(d3,topojson,us){return(
d3.geoAlbersUsa()
  .fitSize([960, 600], topojson.feature(us, us.objects.counties))
)});
  main.variable(observer("votes")).define("votes", ["d3"], async function(d3)
{
  const url = "https://raw.githubusercontent.com/tonmcg/County_Level_Election_Results_12-16/master/2016_US_County_Level_Presidential_Results.csv";
  
  const csv = await d3.csv(url);
  
  const votes = csv
    .map(row => ({
     id: row.combined_fips.padStart(5, "0"),
     count: { total: +row.votes_total, dem: +row.votes_dem, gop: +row.votes_gop },
     percent: { dem: +row.per_dem, gop: +row.per_gop }, 
     two_party_ratio: (+row.votes_dem) / ((+row.votes_dem) + (+row.votes_gop))
    }))

    .map(row => {
      switch (row.id) {
        case "02270": // Wade Hampton Census Area was renamed to Kusilvak Census Area (Alaska)
          return { ...row, id: "02158" };
        case "46113": // Shannon County Census Area was renamed to Oglala Lakota County Census Area (South Dakota)
          return { ...row, id: "46102" };
        default:
          return row;
      }
    }

    )
  
  return votes;
}
);
  main.variable(observer("populations")).define("populations", ["d3"], async function(d3)
{
   //const data = await d3.csv("https://gist.githubusercontent.com/jake-low/907af4cc717e4c289346c6b262d68a50/raw/4e9f4012d346ecff75aaeee751e7f1af3cd9c1d7/co-est2017-alldata.csv");
   const data = csv("bubpop.csv");

  let population = data
    .filter(row => row.COUNTY !== "000")
    .map(row => ({
      id: row.STATE + row.COUNTY,
      population: +row.POPESTIMATE2016
    }));
  
  // // Kalawao County (FIPS 15005) was incorporated into Maui County (FIPS 15009)
  // const kalawao = population.find(county => county.id === "15005");
  // const maui = population.find(county => county.id === "15009");
  
  // maui.population += kalawao.population; // add kalawao population to maui county
  // population = population.filter(county => county.id !== "15005"); // remove kalawao county
  
  return population;
}
);
  main.variable(observer("us")).define("us", ["d3"], async function(d3)
{ 
  const url = "https://gist.githubusercontent.com/jake-low/bd39a072eb4c0822d2c32473816e1c11/raw/5a3296a2049d6719d38b66d0b77c9359b81b8c4c/us-10m-unprojected.json";
  const us = await d3.json(url);
  
  // Kalawao County (FIPS 15005) was incorporated into Maui County (FIPS 15009)
  const counties = us.objects.counties;
  
  const kalawao = counties.geometries.find(county => county.id === "15005");
  const maui = counties.geometries.find(county => county.id === "15009");
  
  maui.arcs.concat(kalawao.arcs); // join the kalawao county geometries into maui county
  counties.geometries = counties.geometries.filter(county => county.id !== "15005"); // remove kalawao county
  
  // Exclude territories and minor outlying areas (Puerto Rico, American Samoa, U.S. Virgin Islands, etc)
  // FIPS prefixes 01xxx (Alabama) through 56xxx (Wyoming) are states; larger values are territories.
  counties.geometries = counties.geometries.filter(county => +county.id < 57000);
  
  const state_fips_codes = await d3.tsv("https://gist.githubusercontent.com/jake-low/f9857e7b5c9a30000dc87cfaf9330ab5/raw/4471d6bbbfb098f27fae5dfc8d9b4ada10dc58e3/state_fips_table.tsv");
  
  const states = us.objects.states;
  
  states.geometries = states.geometries.map(state => ({
    ...state,
    properties: {
      ...state.properties,
      name: state_fips_codes.find(row => row.STATE === state.id).STATE_NAME
    }
  }));
   
  return us;
}
);
  main.variable(observer("regression")).define("regression", ["require"], function(require){return(
require("https://bundle.run/regression@2.0.1")
)});
  main.variable(observer("topojson")).define("topojson", ["require"], function(require){return(
require("topojson-client@3")
)});
//   main.variable(observer()).define(["md"], function(md){return(
// md`## Dependencies`
// )});
  main.variable(observer("d3")).define("d3", ["require"], function(require){return(
require("d3@5")
)});
  main.variable(observer("turf")).define("turf", ["require"], function(require){return(
require("@turf/turf@5")
)});
  main.variable(observer("flubber")).define("flubber", ["require"], function(require){return(
require('https://unpkg.com/flubber')
)});
  return main;
}
