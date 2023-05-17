import "./App.css";
import "mapbox-gl/dist/mapbox-gl.css";

import * as geokeysToProj4 from "geotiff-geokeys-to-proj4";

import ReactMapGl, { Layer, Source } from "react-map-gl";
import { fromArrayBuffer, fromUrl } from "geotiff";
import { pointToTileFraction, tileToBBOX } from "@mapbox/tilebelt";
import { useCallback, useEffect, useRef, useState } from "react";

import { PNG } from "pngjs/browser";
import { plot as Plot } from "plotty";
import SphericalMercator from "@mapbox/sphericalmercator";
import { decode } from "fast-png";
import mapboxgl from "mapbox-gl";
import proj4 from "proj4";

// import usePlotty from "./usePlotty"

// import tiffImg from "../src/AP464_Thermal_M100-102_Modified.tif";

function lon2tile(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}
function lat2tile(lat, zoom) {
  return Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom)
  );
}

const EARTH_CIR_METERS = 40075016.686;
const degreesPerMeter = 360 / EARTH_CIR_METERS;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function latLngToBounds(lat, lng, zoom, width, height) {
  // width and height must correspond to the iframe width/height
  const metersPerPixelEW = EARTH_CIR_METERS / Math.pow(2, zoom + 8);
  const metersPerPixelNS =
    (EARTH_CIR_METERS / Math.pow(2, zoom + 8)) * Math.cos(toRadians(lat));

  const shiftMetersEW = (width / 2) * metersPerPixelEW;
  const shiftMetersNS = (height / 2) * metersPerPixelNS;

  const shiftDegreesEW = shiftMetersEW * degreesPerMeter;
  const shiftDegreesNS = shiftMetersNS * degreesPerMeter;

  return {
    south: lat - shiftDegreesNS,
    west: lng - shiftDegreesEW,
    north: lat + shiftDegreesNS,
    east: lng + shiftDegreesEW,
  };
}

const mergeArrayBuffers = (...arrayBuffers) => {
  // Calculate the total length of all ArrayBuffers
  const totalLength = arrayBuffers.reduce(
    (length, buffer) => length + buffer.byteLength,
    0
  );

  // Create a new Uint8Array to hold the merged data
  const mergedUint8Array = new Uint8Array(totalLength);

  // Offset to keep track of the position in the mergedUint8Array
  let offset = 0;

  // Copy data from each ArrayBuffer into the mergedUint8Array
  for (const buffer of arrayBuffers) {
    const uint8Array = new Uint8Array(buffer);
    mergedUint8Array.set(uint8Array, offset);
    offset += uint8Array.length;
  }

  // Convert the merged Uint8Array back to an ArrayBuffer
  const mergedArrayBuffer = mergedUint8Array.buffer;

  return mergedArrayBuffer;
};

function App() {
  const [viewState, setViewState] = useState({
    // longitude: 71.99473306070817,
    // latitude: 27.458053548258803,
    latitude: 8.886,
    longitude: 77.678,
    zoom: 19,
  });
  const [tiffData, setTiffData] = useState();
  const [canvasImage, setCanvasImage] = useState();
  const [width, setWidth] = useState();
  const [height, setHeight] = useState();
  const [plotData, setPlotData] = useState();
  const [imageData, setImageData] = useState({
    x: 0,
    y: 0,
    value: 0,
    lat: 0,
    lng: 0,
  });
  const plotRef = useRef(null);
  const [imgCoords, setImgCoords] = useState([]);

  const mapRef = useRef();

  // const handleMapClick = async (e) => {
  //   const image = await tiffData.getImage();
  //   const geoKeys = image.getGeoKeys();
  //   const projObj = geokeysToProj4.toProj4(geoKeys);
  //   const projection = proj4(`WGS84`, projObj.proj4);
  //   const { x, y } = projection.forward({
  //     x: e.lngLat.lng,
  //     y: e.lngLat.lat,
  //   });

  //   const width = image.getWidth();
  //   const height = image.getHeight();
  //   const [originX, originY] = image.getOrigin();
  //   const [xSize, ySize] = image.getResolution();
  //   const uWidth = xSize * width;
  //   const uHeight = ySize * height;

  //   const percentX = (x - originX) / uWidth;
  //   const percentY = (y - originY) / uHeight;

  //   const pixelX = Math.floor(width * percentX);
  //   const pixelY = Math.floor(height * percentY);
  //   // const rastorData = await image.readRasters();
  //   const [value] = await image.readRasters({
  //     interleave: true,
  //     window: [pixelX, pixelY, pixelX + 1, pixelY + 1],
  //     samples: [0],
  //   });

  //   // const data = await image.readRasters({
  //   //   interleave: true,
  //   //   samples: [0],
  //   // });
  //   // const value = data[width * pixelY + pixelX];

  //   return setImageData({
  //     x: pixelX,
  //     y: pixelY,
  //     value: value,
  //     lng: e.lngLat.lng,
  //     lat: e.lngLat.lat,
  //   });
  // };

  // useEffect(() => {
  //   // const xhr = new XMLHttpRequest();
  //   // xhr.open("GET", tiffImg);
  //   // xhr.responseType = "arraybuffer";
  //   // xhr.onload = async (e) => {
  //   //   const tiff = await fromArrayBuffer(e.target.response);
  //   //   setTiffData(tiff);
  //   // };
  //   // xhr.send();

  //   const getTiff = async () => {
  //     const tiff = await fromUrl(
  //       "https://storage4operations.blob.core.windows.net/indian/AP488/GIS/THERMAL/GEOREFERENCE/AP488_THERMAL_M9_-M12_REC.tif"
  //     );

  //     // const image = await tiff.getImage();

  //     // const response = await fetch(
  //     //   "https://storage4operations.blob.core.windows.net/indian/AP488/GIS/THERMAL/GEOREFERENCE/AP488_THERMAL_M9_-M12_REC.tif"
  //     // );
  //     // // const arrayBuffer = await tiff.arrayBuffer();
  //     // // const bufArray = await fromArrayBuffer(arrayBuffer);
  //     // // setArrayBuf(bufArray);
  //     setTiffData(tiff);
  //   };

  //   getTiff();
  // }, []);

  // useEffect(() => {
  //   // if (tiffData) {
  //   //   const getImage = async () => {
  //   //     const image = await tiffData.getImage();
  //   //     const png = PNG({ filterType: 4 }).parse(image, function (error, data) {
  //   //     });
  //   //   };
  //   //   getImage();
  //   // }
  // }, [tiffData]);

  const getTiff = useCallback(() => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    if (plotData && plotData.length) {
      if (plotRef.current === null) {
        plotRef.current = new Plot({
          canvas,
          domain: [0, 255],
          colorScale: "inferno",
          data: plotData,
          width: width,
          height: height,
        });
        plotRef.current.setData(plotData, width, height);
      } else {
        plotRef.current.setData(plotData, width, height);
      }
    }
  }, [width, height, plotData]);

  useEffect(() => {
    if (plotRef.current) {
      plotRef.current.render();

      const dataURL = plotRef.current.canvas.toDataURL();
      setCanvasImage(dataURL);
    }
  }, [plotRef.current?.currentDataset]);

  useEffect(() => {
    const getVt = async () => {
      // var gl
      if (mapRef.current) {
        // const boundBox = mapRef.current.getMap().getBounds()
        // console.log("BUND BOX", boundBox)
        const tile = mapRef.current.getMap().getSource("rasterSource")
          .tileBounds.bounds;
        // const tile = mapRef.current.getMap().getBounds();

        const neTile = tile._ne;
        const swTile = tile._sw;

        const boundingBox = [
          [swTile.lng, neTile.lat],
          [neTile.lng, neTile.lat],
          [neTile.lng, swTile.lat],
          [swTile.lng, swTile.lat],
        ];

        setImgCoords(boundingBox);

        // const X = lon2tile(viewState.longitude, viewState.zoom.toFixed(0));
        // const Y = lat2tile(viewState.latitude, viewState.zoom.toFixed(0));
        // const bBox = tileToBBOX([X, Y, viewState.zoom.toFixed(0)]);
        // const boundingBox = [
        //   [bBox[0], bBox[3]],
        //   [bBox[2], bBox[3]],
        //   [bBox[2], bBox[1]],
        //   [bBox[0], bBox[1]],
        // ];

        // console.log("BOUNDING BOX", bBox, boundingBox);
        // console.log("NWE", neTile, swTile);

        // const XYTile = await fetch(
        //   `https://api.mapbox.com/v4/airprobe.7abnkhuw/${viewState.zoom.toFixed(
        //     0
        //   )}/${X}/${Y}.png?access_token=pk.eyJ1IjoiYWlycHJvYmUiLCJhIjoiY2tkcmVqbDF2MDVqbzJ0b3FmeTcxcHFrZSJ9.YQR_ZeBEF43y8pV2KKvHcg`
        // );
        // const arrayBuffer = await XYTile.arrayBuffer();

        // const png = decode(arrayBuffer);
        // // console.log("PNG", png)

        // setWidth(png.width);
        // setHeight(png.height);
        // setPlotData(png.data);

        const topTile = lat2tile(neTile.lat, viewState.zoom.toFixed(0));
        const leftTile = lon2tile(swTile.lng, viewState.zoom.toFixed(0));
        const bottomTile = lat2tile(swTile.lat, viewState.zoom.toFixed(0));
        const rightTile = lon2tile(neTile.lng, viewState.zoom.toFixed(0));

        // const boundingBox = new mapboxgl.LngLatBounds([swBbox[1], swBbox[0]], [neBbox[3], neBbox[2]])
        // const boundingBox = [
        //   [bBox[0], bBox[3]],
        //   [bBox[2], bBox[3]],
        //   [bBox[2], bBox[1]],
        //   [bBox[0], bBox[1]],
        // ];

        // const boundingBox = [
        //   [swTile.lng, neTile.lat],
        //   [neTile.lng, neTile.lat],
        //   [neTile.lng, swTile.lat],
        //   [swTile.lng, swTile.lat],
        // ];

        // console.log("______________");
        // console.log("TOP", topTile);
        // console.log("RIGHT", rightTile);
        // console.log("BOTTOM", bottomTile);
        // console.log("LEFT", leftTile);
        // console.log("BBOX", neBbox);
        // console.log("TILE", tile);
        // console.log("_______________");

        // setWidth(bbWidth * 256);
        // setHeight(bbHeight * 256);

        // console.log("H/W", bbWidth * 256, bbHeight * 256)

        let arrayOfBuffers = [];
        // let bufferLength = 0;

        for (let i = topTile; i <= bottomTile; i++) {
          for (let j = leftTile; j <= rightTile; j++) {
            const newTile = await fetch(
              `https://api.mapbox.com/v4/airprobe.7abnkhuw/${viewState.zoom.toFixed(
                0
              )}/${j}/${i}.png?access_token=pk.eyJ1IjoiYWlycHJvYmUiLCJhIjoiY2tkcmVqbDF2MDVqbzJ0b3FmeTcxcHFrZSJ9.YQR_ZeBEF43y8pV2KKvHcg`
            );
            if (newTile.statusText !== "Not Found") {
              const newArrayBuffer = await newTile.arrayBuffer();
              arrayOfBuffers.push(newArrayBuffer);
              const newPng = decode(newArrayBuffer);
            }
          }
        }

        // console.log("ARRAY BUFFER", arrayOfBuffers);

        const mergedBuffer = mergeArrayBuffers(...arrayOfBuffers);
        // console.log("MERGED BUFFER", mergedBuffer);

        // const png = PNG.sync.read(Buffer.from(mergedBuffer));
        const newPng = decode(mergedBuffer);

        // console.log("IMAGE DATA", imageData);

        // let merged_ab = new Uint8Array();
        // arrayOfBuffers.map((item) => {
        //   let tmp = new Uint8Array(merged_ab.byteLength + item.byteLength);
        //   tmp.set(new Uint8Array(merged_ab), 0);
        //   tmp.set(new Uint8Array(item), merged_ab.byteLength);
        //   merged_ab = tmp;
        //   return merged_ab;
        // });

        // let newBlob = new Blob(merged_ab);
        // let newResp = new Response(newBlob);
        // let newAB = await newResp.arrayBuffer();
        // console.log("NEW AB", newAB);

        // const newPng = decode(newAB);
        setWidth(newPng.width);
        setHeight(newPng.height);
        // setWidth(3 * 256);
        // setHeight(3 * 256);
        setPlotData(newPng.data);
      }
    };
    getVt();
    getTiff();
  }, [viewState]);

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: "5px",
          right: "5px",
          zIndex: 2,
          background: "white",
          padding: "5px",
          borderRadius: "4px",
          border: "1px solid black",
        }}
      >
        <p style={{ padding: "2px" }}>
          x: {imageData.x}, lng: {imageData.lng.toFixed(6)}
        </p>
        <p style={{ padding: "2px" }}>
          y: {imageData.y}, lat: {imageData.lat.toFixed(6)}
        </p>
        <p style={{ padding: "2px" }}>
          temperature value: {imageData.value.toFixed(1)}
        </p>
      </div>
      <ReactMapGl
        {...viewState}
        style={{ height: `100vh`, width: `100vw` }}
        mapboxAccessToken="pk.eyJ1IjoiYWlycHJvYmUiLCJhIjoiY2tkcmVqbDF2MDVqbzJ0b3FmeTcxcHFrZSJ9.YQR_ZeBEF43y8pV2KKvHcg"
        // initialViewState={viewState}
        mapStyle="mapbox://styles/mapbox/satellite-v9"
        // onClick={handleMapClick}
        interactiveLayerIds={["rasterLayer"]}
        ref={mapRef}
        onMove={(e) => {
          setViewState(e.viewState);
        }}
        // "https://a.tiles.mapbox.com/v4/airprobe.7abnkhuw/{z}/{x}/{y}.jpg?access_token=pk.eyJ1IjoiYWlycHJvYmUiLCJhIjoiY2tkcmVqbDF2MDVqbzJ0b3FmeTcxcHFrZSJ9.YQR_ZeBEF43y8pV2KKvHcg"
      >
        <Source
          id="rasterSource"
          type="raster"
          url={"mapbox://airprobe.7abnkhuw"}
          tileSize={256}
        />
        <Layer
          id="rasterLayer"
          type={"raster"}
          source="rasterSource"
          paint={{
            "raster-opacity": 1,
          }}
        />

        {/* {console.log("REF", plotRef)} */}
        {/* {console.log("CANVAS IMAGE", canvasImage)} */}

        {canvasImage ? (
          <>
            <Source
              id="tiffSource"
              url={canvasImage}
              type="image"
              coordinates={imgCoords}
            />
            <Layer id="tiffLayer" source="tiffSource" type="raster" />
          </>
        ) : (
          ""
        )}
      </ReactMapGl>
    </div>
  );
}

export default App;
