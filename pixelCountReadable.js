/**** Start of imports. If edited, may not auto-convert in the playground. ****/
var example = ee.Image("projects/sig-misc-ee/assets/phil/gapFillStrata"),
  image = ee.Image("projects/sig-ee/Philippines/v2/noise/sum_deforestation_2001_2018"),
  image2 = ee.Image("projects/sig-ee/Philippines/v2/noise/sum_restoration_2001_2018");
/***** End of imports. If edited, may not auto-convert in the playground. *****/
// var pc = require('users/dsaah/SIG-EE:CEO/pixelCountReadable');
// // // Example of how to use code.
// var humanReadableStrata = ee.Dictionary({
//     0: "no data",
//     31: "deforested epoch 1",
//     32: "deforested epoch 2",
//     33: "deforested epoch 3",
//     41: "reforested epoch 1",
//     42: "reforested epoch 2",
//     43: "reforested epoch 3",
//     50: "stable forest",
//     60: "stable non forest",
//     70: "dynamic",
//     80: "reforestation",
// });

// var image = ee.Image('projects/sig-ee/Philippines/v2/strata/gapFillStrata-2-0-1')
//   .rename('strata-2-0-1');
var requestDict = {
  image: image2.rename('test'), //one or more bands
  statsBand: 'test', //the band name to generate stats
  // groubBy : string //optional band name to group stats by
  reducer: 'sum', // the type of ststs to generate :sum, count, mean
  region: image2.geometry().bounds(), //the region of interest
  scale: 1000, //the scale to calculate stats at
  // crs : string //crs code to use
}
// var counts = getStatsImage(requestDict);
// print(counts)
// print(counts.map*f)
// var countsReadable = setReadable(counts, makeHumanReadableFromValues(counts,'counts'));

// print(counts);
// print(countsReadable);

// Export.table.toDrive({
//   collection:countsReadable,
//   description: 'countsReadableSumReforestation',
//   folder:'pixelCounts',
//   selectors:'map_name,map_value,count,readable'

// });
// var s = image.stratifiedSample(
//   {numPoints:10,
//   region:image.geometry().bounds(),
//   scale:30,
//   classValues:[0,1,2,3,4,5,6,7,8], classPoints:[0,0,0,0,10,10,10,10,10], geometries:true})
// Map.addLayer(s.filterMetadata('change','equals',8))


exports = {
  getPixelCounts: getPixelCounts,
  getStatsImage: getStatsImage,
  setReadable: setReadable,
  makeHumanReadableFromValues: makeHumanReadableFromValues,
  default_selectors: 'map_name,map_value,count,readable'
};
////////////////////////////////////////////////////////////////////////////////////
//// functions
////////////////////////////////////////////////////////////////////////////////////
// var requestDict = {
// image : ee.Image() //one or more bands
// statsBand : string //the band name to generate stats
// groubBy : string //optional band name to group stats by
// reducer: string // the type of ststs to generate :sum, count, mean
// region: ee.FeatureCollection() //the region of interest
// scale : int //the scale to calculate stats at
// crs : string //crs code to use
// }

/**
 * Computes stats on a single band of input image with any number of bands and write the outputs to a feature collection. Paramters inlude:
 * image: the image to generate stats of
 * statsBand: the name of the band to calculate stats of
 * groupBy: optional, a band to group the stats band by (e.g. carbon counts grouped by land cover)
 * reducer: the name of the reducer to apply. currently supported:sum, count, mean
 * region: the region to calculate stats
 * scale: the scale to calculate stats
 * crs: optional, a crs for the stats defaults to epsg 4326 
 * @param {{image:ee.Image, statsBand:str, groupBy:str, reducer:str, region:ee.Geometry, scale:int, crs:str}} requestDict A dictionary of paramters to define what stats should be computed.
 * @returns ee.FeatureCollection({map_name:statsBand, map_value:groupByImages map value, reducerName:reducer statistics})
 */
function getStatsImage(requestDict) {
  var image = requestDict.image;
  var statsBand = requestDict.statsBand;
  var reducerName = requestDict.reducer;
  var scale = requestDict.scale;
  var region = requestDict.region;
  var groupBy = requestDict.groupBy;
  var crs = requestDict.crs || 'EPSG:4326';

  var groupByImg, statsImg;
  if (typeof groupBy === 'string') {
    print(groupBy)
    groupByImg = image.select(groupBy);
  } else {
    print('using input band')
    print(typeof groupBy, groupBy)
    groupByImg = image.select(statsBand);
  }

  // todo raise error if len bandnames is 0
  statsImg = image.select(statsBand)

  // calc pixel count by band, return list of objects
  var stats = getStatsSingleBand(
    statsImg,
    groupByImg,
    reducerName,
    scale,
    region,
    crs
  );

  // convert areas from dictionary to properties of a feature
  var fc = makeFeaturesNew(stats, reducerName);
  var out = ee.FeatureCollection(ee.List(fc).flatten());

  return out;
}

/**
 * Calculates stats for an input image grouped by another image.
 * 
 * @param {ee.Image} statsImg the image to generate stats of
 * @param {ee.Image} groupByImg the image to group stats by 
 * @param {str} reducerName  the name of the reducer to apply. currently supported:sum, count, mean
 * @param {int} scale optional, the scale to calculate stats, defaults to 30m
 * @param {ee.Geometry} region  optional, the region to calculate stats, defaults to image bounds
 * @param {str} crs optional, a crs for the stats defaults to epsg 4326 
 * @returns Object (ee.Dictionary)
 */
function getStatsSingleBand(
  statsImg,
  groupByImg,
  reducerName,
  scale,
  region,
  crs) {

  region = region || image.geometry().bounds();
  scale = scale || 30;
  crs = crs || 'EPSG:4326';

  // rename the band to add prefix of area_.
  // this is used down the pipe when building the FC
  var bands = statsImg.bandNames();
  var prefix = "area_";
  var newName = ee.String(prefix).cat(bands.get(0));
  var imagePrefix = image.select([0], [newName]);
  var reducer = getReducer(reducerName);

  var stats_img = statsImg.addBands(groupByImg)
  stats_img = stats_img.reduceRegion({
    reducer: reducer.group({
      groupField: 1,
      groupName: newName,
    }),
    geometry: region,
    scale: scale,
    maxPixels: 1e13,
    bestEffort: false,
    tileScale: 16,
    crs: crs
  });

  return stats_img;
}
// calculates pixel count by band return list of objects. Optionally, include an image to restrict calculaions to like a landcover map.
function getStatsByLandcover(image, landcover, region, scale, crs) {
  landcover = landcover || image;
  region = region || image.geometry().bounds();
  scale = scale || 30;
  crs = crs || 'EPSG:4326';
  print(crs)
  var areaBands = image.bandNames();

  var stats = areaBands.getInfo().map(function (f) {

    var band = image.select(f);
    band = band.addBands(landcover);
    var stats_img = band.reduceRegion({
      reducer: ee.Reducer.count().group({
        groupField: 1,
        groupName: 'area_' + f,
      }),
      geometry: region,
      scale: scale,
      maxPixels: 1e13,
      bestEffort: false,
      tileScale: 16,
      crs: crs
    });
    return stats_img;

  });
  return stats;
}



/**
 * adds a human readable property based on a map_value
 * 
 * @param {ee.FeatureCollection} fc 
 * @param {ee.Dictionary} dict 
 * @param {str} prop The property you want to set a readable name to
 * @param {str} readable The name of the new property to add, defaults to 'readable'
 * @returns 
 */
function setReadable(fc, dict, prop, readable) {
  prop = prop || 'map_value';
  readable = readable || 'readable';

  fc = fc.map(function (f) {
    var mapValue = f.get(prop);
    return f.set(readable, dict.get(mapValue));
  });
  return fc;
}


function getPixelCounts(image, landcover, scale, region, crs, printStats) {
  printStats = printStats || false;
  crs = crs || 'EPSG:4326';

  // calc pixel count by band, return list of objects
  var stats = getStatsByLandcover(image, landcover, region, scale, crs);

  // convert areas from dictionary to properties of a feature
  var fc = stats.map(makeFeatures);
  if (printStats) {
  }
  var out = ee.FeatureCollection(ee.List(fc).flatten());

  return out
}

// orginize stats so each map value, name, and count is converted to a feature
function makeFeatures(el) {
  var propst = ee.List(el.get('groups')).map(function (f) {

    var featureName = ee.Dictionary(f).keys().get(0);
    var featureValues = ee.Dictionary(f).values();

    return ee.Dictionary({ 'map_name': featureName, 'map_value': featureValues.get(0), 'count': featureValues.get(1) });
  });
  // make a feature for each element
  var features = propst.map(function (f) {
    var point = ee.Feature(ee.Geometry.Point([0, 0]), f);
    return point;
  });

  return features;
}
/**
 * organizes stats so each map value, name, and count is converted to a feature
 * 
 * @param {object, ee.Dictionary} el output from reduceRegion using groupBy 
 * @param {str} reducerName the name of the reducer used to calculate statistics
 * @returns ee.FeatureCollection({map_name:statsBand, map_value:groupByImages map value, reducerName:reducer statistics})
 */
function makeFeaturesNew(el, reducerName) {
  var propst = ee.List(el.get('groups')).map(function (f) {

    var featureName = ee.Dictionary(f).keys().get(0);
    var featureValues = ee.Dictionary(f).values();
    var dict = ee.Dictionary({ 'map_name': featureName, 'map_value': featureValues.get(0) });
    dict = dict.set(reducerName, featureValues.get(1));
    return dict
  });
  // make a feature for each element
  var features = propst.map(function (f) {
    var point = ee.Feature(ee.Geometry.Point([0, 0]), f);
    return point;
  });

  return features;
}

/**
 * creates a human readable dictionary from the output of the getPixelCounts function.
 * The readable name is formatted as "{description} {i}" where i is the map vlaue.
 * By default description is "map value" 
 * 
 * e.g. makeHumanReadableFromValues(input, 'useful description')
 * input feature collection with  a feature where map_value = 1 
 * outputs {1:"'useful description 1"}
 * 
 * @param {ee.FeatureCollection} countsFeatureCollection feature collection to add properties to
 * @param {str} description optional, the description to concatenate with a map value, defaults to map_value
 * @returns ee.Dictionary({int_map_value:description_map_value})
 */
function makeHumanReadableFromValues(countsFeatureCollection, description) {
  description = description || 'map value';

  var keys = ee.List(countsFeatureCollection.aggregate_array('map_value'))
    .distinct()
    .map(function (k) { return ee.String(k) });

  var values = keys.map(function (k) {
    return ee.List([description, k]).join(' ');
  });

  return ee.Dictionary.fromLists(keys, values);
}

function getReducer(reducerName) {
  reducerName = String(reducerName).toLowerCase()
  var reducer
  if (reducerName === 'sum') {
    reducer = ee.Reducer.sum();
  }
  else if (reducerName === "count") {
    reducer = ee.Reducer.count();
  }
  else if (reducerName === "mean") {
    reducer = ee.Reducer.mean();
  }
  else {
    print('reducer ' + reducerName + ' is not supported');
    return 1
  }
  return reducer;
}