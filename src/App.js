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
  const [isShowingTiff, setIsShowingTiff] = useState(true);
  const mapRef = useRef();

  const [plotDetails, setPlotDetails] = useState([]);
  const [xDetails, setXDetails] = useState({});
  const [yDetails, setYDetails] = useState({});
  // const getTiff = useCallback(() => {
  //   const canvas = document.createElement("canvas");
  //   canvas.width = width;
  //   canvas.height = height;
  //   if (plotData && plotData.length) {
  //     // if (plotRef.current === null) {
  //       plotRef.current = new Plot({
  //         canvas,
  //         domain: [0, 255],
  //         colorScale: "inferno",
  //         data: plotData,
  //         width: width,
  //         height: height,
  //       });
  //       plotRef.current.setData(plotData, width, height);
  //     // } else {
  //       // plotRef.current.setData(plotData, width, height);
  //     // }
  //   }
  // }, [width, height, plotData]);

  // useEffect(() => {
  //   // mapboxgl.maxParallelImageRequests = 10;

  // }, []);

  // useEffect(() => {
  //   if (plotRef.current) {
  //     plotRef.current.render();

  //     const dataURL = plotRef.current.canvas.toDataURL();
  //     setCanvasImage(dataURL);
  //   }
  // }, [plotRef.current?.currentDataset]);
  //
  // debugger;
  useEffect(() => {
    const getVt = () => {
      if (mapRef.current) {
        const tile = mapRef.current.getMap().getBounds();

        const neTile = tile._ne;
        const swTile = tile._sw;

        const topTile = lat2tile(neTile.lat, viewState.zoom.toFixed(0));
        const leftTile = lon2tile(swTile.lng, viewState.zoom.toFixed(0));
        const bottomTile = lat2tile(swTile.lat, viewState.zoom.toFixed(0));
        const rightTile = lon2tile(neTile.lng, viewState.zoom.toFixed(0));

        setXDetails({
          startPos: leftTile,
          endPos: rightTile,
          zoom: viewState.zoom.toFixed(0),
        });

        setYDetails({
          startPos: topTile,
          endPos: bottomTile,
          zoom: viewState.zoom.toFixed(0),
        });

        console.log("-----------");
        console.log("TOP TILE", topTile);
        console.log("BOTTOM TILE", bottomTile);
        console.log("LEFT TILE", leftTile);
        console.log("RIGHT TILE", rightTile);

        // for (let i = topTile + 1; i < bottomTile; i++) {
        //   for (let j = leftTile + 1; j < rightTile; j++) {
        //     const newTile = await fetch(
        //       `https://api.mapbox.com/v4/airprobe.7abnkhuw/${viewState.zoom.toFixed(
        //         0
        //       )}/${j}/${i}.png?access_token=pk.eyJ1IjoiYWlycHJvYmUiLCJhIjoiY2tkcmVqbDF2MDVqbzJ0b3FmeTcxcHFrZSJ9.YQR_ZeBEF43y8pV2KKvHcg`
        //     );
        //     if (newTile.statusText !== "Not Found") {
        //       const newArrayBuffer = await newTile.arrayBuffer();
        //       arrayOfBuffers.push(newArrayBuffer);
        //       const newPng = decode(newArrayBuffer);
        //     }
        //   }
        // }
      }
    };
    getVt();
    // getTiff();
  }, [viewState]);

  useEffect(() => {
    const createPlotMeta = async () => {
      console.log("RUNNING", xDetails, yDetails);
      setPlotDetails([]);
      // mapboxgl.maxParallelImageRequests = 10;
      for (let i = yDetails.startPos; i <= yDetails.endPos; i++) {
        for (let j = xDetails.startPos; j <= xDetails.endPos; j++) {
          const tile = await fetch(
            `https://api.mapbox.com/v4/airprobe.7abnkhuw/${xDetails.zoom}/${j}/${i}.png?access_token=pk.eyJ1IjoiYWlycHJvYmUiLCJhIjoiY2tkcmVqbDF2MDVqbzJ0b3FmeTcxcHFrZSJ9.YQR_ZeBEF43y8pV2KKvHcg`
          );
          if (tile.statusText !== "Not Found") {
            const arrayBuf = await tile.arrayBuffer();
            const png = decode(arrayBuf);
            const bBox = tileToBBOX([j, i, xDetails.zoom]);
            const tileBounds = [
              [bBox[0], bBox[3]],
              [bBox[2], bBox[3]],
              [bBox[2], bBox[1]],
              [bBox[0], bBox[1]],
            ];
            // const plotObj = {
            //   png: png,
            //   bounds: tileBounds,
            // };
            const canvas = document.createElement("canvas");
            canvas.width = png.width;
            canvas.height = png.height;
            const plot = new Plot({
              canvas,
              domain: [0, 255],
              colorScale: "inferno",
              data: png.data,
              width: png.width,
              height: png.height,
            });
            plot.render();

            const dataURL = canvas.toDataURL();
            const tileObj = {
              dataURL: dataURL,
              bounds: tileBounds,
            };

            setPlotDetails((prevState) => {
              return [...prevState, tileObj];
            });
          }
        }
      }
    };
    createPlotMeta();
  }, [xDetails, xDetails]);

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => {
          setIsShowingTiff(!isShowingTiff);
        }}
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

        {/* {canvasImage && isShowingTiff ? (
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
        )} */}

        {plotDetails && plotDetails.length
          ? plotDetails.map((plotObj, index) => {
              console.log("plotObj", plotObj);
              if (plotObj.dataURL !== "data:,") {
                return (
                  <>
                    <Source
                      id={`tiffSource${index}`}
                      type="image"
                      url={plotObj.dataURL}
                      coordinates={plotObj.bounds}
                    />

                    <Layer
                      id={`tiffLayer${index}`}
                      source={`tiffSource${index}`}
                      type="raster"
                    />
                  </>
                );
              }
            })
          : ""}
      </ReactMapGl>
    </div>
  );
}

export default App;
