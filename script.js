let map = null
let barchart = null


Promise.all([
  d3.json('counties-10m.json'),
  d3.json('states.json'),
  d3.json('states_hash.json'),
  d3.json('cities.json'),
  d3.json('cities_extended.json')
])
.then(([topoData, stateData, stateNames, cityData, stateCityData]) => {
  map = new Map(topoData, stateData, stateNames, stateCityData)
  barchart = new BarChart(topoData, stateData, stateNames, stateCityData)
  map.drawMap(topoData)
  document.getElementById('choropleth')
    .addEventListener('click', e => {
      const { checked } = e.target
      if (checked) {
        map.drawChoropleth(topoData)
        map.drawLegend()
        d3.select('.initialStates').remove()
        d3.select('#initialStateText').remove()
        d3.select('#bubbles').remove()
        d3.select('.legend').remove()
        d3.select('#cityText').remove()
        document.getElementById("bubble").checked = false
      } else {
        map.drawMap(topoData)
        d3.select('.states').remove()
        d3.select('.axis').remove()
        d3.select('#gradient').remove()
        d3.select('#stateText').remove()
      }
    })
  document.getElementById('bubble')
    .addEventListener('click', e => {
      const { checked } = e.target
      if (checked) {
        map.drawBubbleMap(cityData)
        barchart.drawBarChart(cityData)
      } else {
        d3.select('#bubbles').remove()
        d3.select('.legend').remove()
        d3.select('#cityText').remove()
      }
    })
})
.catch( error => 
  console.error('Cannot load data.\n' + error)
)

class Map {
  constructor(us, stateData, stateNames, stateCityData) {
    this.width = 975 // 450
    this.height = 610 // 250
    this.defaultScale = 1
    this.defaultTranslation = [0, 0]
    this.svg = d3.select('.main')
      .append('svg')
      .attr('width', this.width)
      .attr('height', this.height)
      .attr('id', 'map')
      .append('g')
    this.projection = d3.geoAlbersUsa()
      .translate([this.width / 2 + 25, this.height / 2 + 5])
      .scale(1200) // 500
    this.path = d3.geoPath().projection(this.projection)
    
    let numbers = []
    stateData.forEach(state => {
      const tmp = state.deathsPerPop
      numbers.push(state.deathsPerPop)
    })
    const min = d3.min(numbers)
    const max = d3.max(numbers)
    this.min = min
    this.max = max

    const topoStates = us.objects.states.geometries
    for (const topoState of topoStates) {
      const topoStateName = topoState.properties.name
      const index = stateData.findIndex(
        thisState => thisState.name == topoStateName
      )
      if (index >= 0) {
        topoState.properties.deaths = stateData[index].deaths
        topoState.properties.male = stateData[index].male
        topoState.properties.female = stateData[index].female
        topoState.properties.pop = stateData[index].population
        topoState.properties.dpp = stateData[index].deathsPerPop
      }
    }
    for (const topoState of topoStates) {
      const topoStateName = topoState.properties.name
      const stateAbbreviation = Object.keys(stateNames)
        .find(key => stateNames[key] === topoStateName)
      topoState.abbreviation = stateAbbreviation
      topoState.properties.cities = []
    }
    for (const city of stateCityData) {
      const index = topoStates.findIndex(
        topoState => city.state == topoState.abbreviation)
      if (index >= 0) {
        topoStates[index].properties.cities.push(city)
      }
    }
    Object.keys(topoStates).forEach((state) => {
      topoStates[state].properties.cities = 
        topoStates[state].properties.cities.sort((c1, c2) => {
          if (c1.males + c1.females < c2.males + c2.females)
            return 1
          else if (c1.males + c1.females > c2.males + c2.females)
            return -1
          else
            return 0
        }).slice(0, 7)
    })
  }

  drawMap(us) {
    const states = topojson
      .feature(us, us.objects.states).features
    const tooltip = d3.select('body')
      .append('div')
        .attr('id', 'tooltip')
        .style('opacity', 0)  
        .style('background', '#789')
        .style('font', '14px sans-serif')
        .style('width', '150px')
        .style('height', '125px')
        .style('padding', '5px')
    this.svg
      .selectAll('path')
        .data(states)
      .enter()
      .append('path')
        .attr('d', this.path)
        .attr('stroke', '#3182bd') 
        .attr('stroke-width', '0.3') 
        .attr('fill', 'lightgray')
      .on('click', this.zoom.bind(this))
      .on('mouseover', d => tooltip.style('opacity', 0.8))
      .on('mousemove', function(d) {
        //barchart.drawBarChart(d.properties)
        tooltip
          .html('<strong>' + d.properties.name + '</strong><br/><br/>'
            + '<em>Deaths:</em> ' + d.properties.deaths + '<br/>' +
            '<em>Male:</em> ' + d.properties.male + '<br/>' +
            '<em>Female:</em> ' + d.properties.female + '<br/><br/>' +
            '(click to see cities)'
            )
          .style('left', (d3.event.pageX - 35) + 'px')
          .style('top', (d3.event.pageY + 10) + 'px')
      })
      .on('mouseout', d => {
        tooltip.style('opacity', 0)
      })
    this.svg.append('text')
      .attr('id', 'initialStateText')
      .attr('x', 370)             
      .attr('y', 20)
      .style('font-size', '24px') 
      .style('fill', '#466995')
      .text('Number of total deaths per state')
  }

  zoom(state) {
    const { scale, translate } = this.getTransforms(state)
    this.scale = scale
    this.translate = translate
    this.svg
      .transition()
      .duration(500)
      .on('start', () => {
        d3.select('#bubbles').remove()
        d3.select('.legend').remove()
        d3.select('#cityText').remove()
        document.getElementById("bubble")
          .style.visibility = 'hidden'
        document.getElementById("choropleth")
          .style.visibility = 'hidden'
      })
      .on('end', () => {
        if (this.selectedState !== state.properties.name) {
          d3.select('#stateCities').remove()
          this.drawCities(state)
          this.selectedState = state.properties.name
          return
        }
        this.selectedState = null
        document.getElementById("bubble")
          .style.visibility = 'visible'
        document.getElementById("choropleth")
          .style.visibility = 'visible'
        d3.select('#stateCities').remove()
      })
      .attr('transform', 'translate(' + translate + 
            ')scale(' + scale + ')')
  }

  drawCities(state) {
    const tooltip = d3.select('body')
      .append('div')
        .attr('id', 'tooltip')
        .style('opacity', 0)  
        .style('background', '#789')
        .style('font', '14px sans-serif')
        .style('width', '150px')
        .style('height', '125px')
        .style('padding', '5px')
    const cities = this.svg.append('g')
      .attr('id', 'stateCities')
      .selectAll('circle')
        .data(state.properties.cities)
      .enter()
      .append('circle')
        .attr('cx', d => 
          this.projection([ d.lng, d.lat ])[0])
        .attr('cy', d => 
          this.projection([ d.lng, d.lat ])[1])
        .attr('r', '1')
        .attr('fill', '#008888')
        .attr('opacity', 0.5)
        .on('mouseover', d => {
          tooltip.style('opacity', 0.8)
        })
        .on('mousemove', function(d) {
          //barchart.drawBarChart(d)
          tooltip
            .html('<strong>' + d.names + '</strong><br/><br/>'
              + '<em>Deaths:</em> ' + (d.females + d.males) +
              '<br/>' + '<em>Males:</em> ' + d.males + '<br/>' +
              '<em>Females:</em> ' + d.females + '<br/>' +
              '<em>Average age:</em> ' + d.age)
          .style('left', (d3.event.pageX - 35) + 'px')
          .style('top', (d3.event.pageY + 10) + 'px')
        })
        .on('mouseout', d => tooltip.style('opacity', 0))
  }

  getTransforms(state) {
    if (this.selectedState === state.properties.name) {
      return { 
        scale: this.defaultScale, 
        translate: this.defaultTranslation
      }
    }
    const bounds = this.path.bounds(state)
    const width = bounds[1][0] - bounds[0][0]
    const height = bounds[1][1] - bounds[0][1]
    const centerX = (bounds[0][0] + bounds[1][0]) / 2
    const centerY = (bounds[0][1] + bounds[1][1]) / 2
    const scale = 0.8 / Math.max(
      width / this.width, height / this.height)
    const translate = [this.width / 2 - scale * centerX, 
                       this.height / 2 - scale * centerY ]
    return { scale, translate }
  }

  drawChoropleth(us) {
    const states = topojson
      .feature(us, us.objects.states).features
    const scale = d3.scaleSequential()
    scale
      .domain([this.min, this.max])
      .interpolator(d3.interpolatePuBu)
    const tooltip = d3.select('body')
    .append('div')
      .attr('id', 'tooltip')
      .style('opacity', 0)
      .style('background', '#789')
      .style('font', '14px sans-serif')
      .style('width', '150px')
      .style('height', '125px')
      .style('padding', '5px')
    this.svg
      .append('g')
        .attr('class', 'states')
      .selectAll('path')
        .data(states)
      .enter()
      .append('path')
        .attr('d', this.path)
        .attr('stroke', '#3182bd') 
        .attr('stroke-width', '0.1') 
        .attr('fill', d => scale(d.properties.dpp))
      .on('mouseover', d => tooltip.style('opacity', 0.8))
      .on('mousemove', function(d) {
        // barchart.drawBarChart(d.properties)
        tooltip
          .html(d.properties.name + '<br/>' + 
            d.properties.dpp)
          .html('<strong>' + d.properties.name + '</strong><br/><br/>'
            + '<em>Deaths:</em> ' + d.properties.deaths + '<br/>' +
            '<em>Population:</em> ' + d.properties.pop + '<br/>' +
            '<em>Deaths Per 1M:</em> ' + (d.properties.dpp * 
            1000000) + '<br/><br/>' +
            '(fill color is D/1M)'
            )
          .style('left', (d3.event.pageX - 35) + 'px')
          .style('top', (d3.event.pageY + 10) + 'px')
      })
      .on('mouseout', d => tooltip.style('opacity', 0))
    this.svg.append('text')
      .attr('id', 'stateText')
      .attr('x', 370)             
      .attr('y', 20)
      .style('font-size', '24px') 
      .style('fill', '#466995')
      .text('Number of state deaths per 1 million people')
  }

  drawLegend() {
    const gradient = this.svg
      .append('defs')
      .append('svg:linearGradient')
        .attr('id', 'gradient')
        .attr('x1', '100%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '100%')
        .attr('spreadMethod', 'pad')
    const startColor = d3.interpolatePuBu(0)
    const stopColor = d3.interpolatePuBu(1)
    gradient
      .append('stop')
        .attr('offset', '0%')
        .attr('stop-color', stopColor)
        .attr('stop-opacity', 1)
    gradient
      .append('stop')
        .attr('offset', '100%')
        .attr('stop-color', startColor)
        .attr('stop-opacity', 1)
    const width = 35
    const height = 400
    const factor = 1000000
    const axisScale = d3.scaleLinear()
      .range([height-1, 0])
      .domain([this.min * factor, this.max * factor])
    const axis = d3.axisLeft(axisScale)
    const legend = this.svg
      .append('g')
        .attr('transform', 'translate(30, 70)')
    legend
      .append('rect')
        .attr('width', width)
        .attr('height', height)
        .style('fill', 'url(#gradient)')
    legend
      .append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(${width - 35}, 0)`)
        .style("font-size", "12px")
        .call(axis)
  }
  
  drawBubbleMap(cityData) {
    this.svg.append('text')
      .attr('id', 'cityText')
      .attr('x', 450)             
      .attr('y', 50)
      .style('font-size', '24px') 
      .style('fill', '#466995')
      .text('+ total deaths per city')
    const cities = this.svg
      .append('g')
      .attr('id', 'bubbles')
    let numbers = []
    cityData.forEach(city => {
      numbers.push(+city.total)
    })
    const min = d3.min(numbers)
    const max = d3.max(numbers)
    const scale = d3.scaleLinear()
      .range([3, 40])
      .domain([min, max])
    cities
      .selectAll('circle')
        .data(cityData)
      .enter()
      .append('circle')
        .attr('cx', d => this.projection([d.lon, d.lat])[0])
        .attr('cy', d => this.projection([d.lon, d.lat])[1])
        .attr('r', d => scale(d.total))
        .attr('fill', '#008888')
        .attr('opacity', 0.5)
        .attr('class', 'city')
        .on('mousemove', d => {
          barchart.drawBarChart(d)
        })
      .append('title')
        .text(d => d.name + '\nDeaths: ' + d.total)
    cities
      .selectAll('text')
        .data(cityData)
      .enter()
      .append('text')
        .attr('x', d => this.projection([d.lon, d.lat])[0])
        .attr('y', d => this.projection([d.lon, d.lat])[1])
        .attr('font-size', 10)
        .attr('transform', 'translate(1, 5)')
    const legend = this.svg
      .append('g')
        .attr('class', 'legend')
        .attr('transform', 'translate(' + (this.width - 60) +
          ',' + (this.height - 100) + ')')
      .selectAll('g')
        .data([min, max/3, max])
      .enter()
        .append('g')
    const radius = d3.scaleSqrt()
      .range([3, 40])
      .domain([min, max])
    legend
      .append('circle')
        .attr('cy', d => -radius(d))
        .attr('r', radius)
    legend
      .append('text')
        .attr('y', d => -radius(d) * 2)
        .attr('dy', '-0.3em')
        .text(d3.format('.2s'))
          .style("font-size", "12px")
  }
}

class BarChart {
  constructor(us, stateData, stateNames, stateCityData) {
    this.width = 975 // 450
    this.height = 610 // 250
    this.defaultScale = 1
    this.defaultTranslation = [0, 0]
    this.svg = d3.select('.main')
      .append('svg')
      .attr('width', this.width)
      .attr('height', this.height)
      .attr('id', 'map')
      .append('g')
    this.projection = d3.geoAlbersUsa()
      .translate([this.width / 2 + 25, this.height / 2 + 5])
      .scale(1200) // 500
    this.path = d3.geoPath().projection(this.projection)
  }

  drawBarChart(cityData) {
    console.log(cityData)
    
  //   const margin = {top: 10, right: 20, bottom: 50, left: 150};
    
  //   const visWidth = 500;
  //   const visHeight = 200;
  
  //   // const svg = d3.create('svg')
  //   //     .attr('width', visWidth + margin.left + margin.right)
  //   //     .attr('height', visHeight + margin.top + margin.bottom);
  
  //   const div = this.svg.selectAll("g").remove()

  //   const g = this.svg.append("g")
  //       .attr("transform", `translate(${margin.left}, ${margin.top})`);
    
  //   // create scales
    
  //   const x = d3.scaleLinear()
  //       .range([0, visWidth]);
    
  //   const y = d3.scaleBand()
  //       .range([0, visHeight])
  //       .padding(0.2);
    
  //   // create and add axes
    
  //   const xAxis = d3.axisBottom(x).tickSizeOuter(0);
    
  //   const xAxisGroup = g.append("g")
  //       .attr("transform", `translate(0, ${visHeight})`);
    
  //   xAxisGroup.append("text")
  //       .attr("x", visWidth / 2)
  //       .attr("y", 40)
  //       .attr("fill", "black")
  //       .attr("text-anchor", "middle")
  //       .text(cityData.name);
    
  //   const yAxis = d3.axisLeft(y);

  //   const yAxisGroup = g.append("g")
    
  //   yAxisGroup.append("text")
  //       .attr("x", 40)
  //       .attr("y", visHeight / 2)
  //       .attr("fill", "black")
  //       .attr("text-anchor", "middle")
  //       .text("Total Deaths")
  //       .call(yAxis)
  //       // remove baseline from the axis
  //       .call(g => g.select(".domain").remove());
      
  //   let barsGroup = g.append("g");
  
  //   // update x scale
  //   x.domain([0, 500])

  //   // update x axis

  //   const t = this.svg.transition()
  //       .ease(d3.easeLinear)
  //       .duration(200);

  //   xAxisGroup
  //     .transition(t)
  //     .call(xAxis);
    
  //   // draw bars
  //   barsGroup.selectAll("rect")
  //     .data(cityData)
  //     .join("rect")
  //       .attr("fill", 'blue')
  //       .attr("height", y.bandwidth())
  //       .attr("x", cityData.total)
  //       .attr("y", 0)
  //     .transition(t)
  //       .attr("width", 100)
  // }

    // Set graph margins and dimensions
    var margin = {top: 10, right: 20, bottom: 50, left: 250},
    width = 500,
    height = 200

    const div = this.svg.selectAll("g").remove()

    const g = this.svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`)

    // Set ranges
    var x = d3.scaleBand()
          .range([0, width])
          .padding(0.1);
    var y = d3.scaleLinear()
          .range([height, 0]);

    // var svg = d3.select("body").append("svg")
    // .attr("width", width + margin.left + margin.right)
    // .attr("height", height + margin.top + margin.bottom)
    // .append("g")
    // .attr("transform", 
    //       "translate(" + margin.left + "," + margin.top + ")");

    // Get data

    const data = [
      {'name': 'Male',
      'amounts': cityData.male},
      {'name': 'Female',
      'amounts': cityData.female}
    ]

    // Scale the range of the data in the domains
    x.domain(data.map(function(d) { return d.name; }));
    y.domain([0, d3.max(data, function(d) { return d.amounts; })]);

    // Append rectangles for bar chart
    g.selectAll(".bar")
      .data(data)
    .enter().append("rect")
      .attr("fill", 'steelblue')
      .attr("class", "bar")
      .attr("x", function(d) { return x(d.name); })
      .attr("width", x.bandwidth())
      .attr("y", function(d) { return y(d.amounts); })
      .attr("height", function(d) { return height - y(d.amounts); });

    // Add x axis
    g.append("g")
      .attr("transform", "translate(0," + height + ")")
      .call(d3.axisBottom(x));

    // Add y axis
    g.append("g")
      .call(d3.axisLeft(y))
      .append("text")
        .attr("x", -50)
        .attr("y", height / 2)
        .attr("fill", "black")
        .attr("text-anchor", "middle")
        .text(cityData.name)
  }
}
