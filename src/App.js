import "./App.css";
import "mapbox-gl/dist/mapbox-gl.css";

import * as geokeysToProj4 from "geotiff-geokeys-to-proj4";

import ReactMapGl, { Layer, Source } from "react-map-gl";
import { fromArrayBuffer, fromUrl } from "geotiff";
import { useEffect, useRef, useState } from "react";

import proj4 from "proj4";

// import tiffImg from "../src/AP464_Thermal_M100-102_Modified.tif";

function App() {
  const [viewState] = useState({
    // longitude: 71.99473306070817,
    // latitude: 27.458053548258803,
    latitude: 8.886,
    longitude: 77.678,
    zoom: 19,
  });
  const [tiffData, setTiffData] = useState();
  const [imageData, setImageData] = useState({
    x: 0,
    y: 0,
    value: 0,
    lat: 0,
    lng: 0,
  });
  const mapRef = useRef();

  const handleMapClick = async (e) => {
    console.log(e);
    const image = await tiffData.getImage();
    const geoKeys = image.getGeoKeys();
    const projObj = geokeysToProj4.toProj4(geoKeys);
    const projection = proj4(`WGS84`, projObj.proj4);
    console.log("image", image);
    const { x, y } = projection.forward({
      x: e.lngLat.lng,
      y: e.lngLat.lat,
    });

    const width = image.getWidth();
    const height = image.getHeight();
    const [originX, originY] = image.getOrigin();
    const [xSize, ySize] = image.getResolution();
    const uWidth = xSize * width;
    const uHeight = ySize * height;

    const percentX = (x - originX) / uWidth;
    const percentY = (y - originY) / uHeight;

    const pixelX = Math.floor(width * percentX);
    const pixelY = Math.floor(height * percentY);
    // const rastorData = await image.readRasters();
    // console.log(rastorData);
    const [value] = await image.readRasters({
      interleave: true,
      window: [pixelX, pixelY, pixelX + 1, pixelY + 1],
      samples: [0],
    });

    // const data = await image.readRasters({
    //   interleave: true,
    //   samples: [0],
    // });
    // const value = data[width * pixelY + pixelX];
    console.log("x, y, value", pixelX, pixelY, value);

    return setImageData({
      x: pixelX,
      y: pixelY,
      value: value,
      lng: e.lngLat.lng,
      lat: e.lngLat.lat,
    });
  };

  useEffect(() => {
    // const xhr = new XMLHttpRequest();
    // xhr.open("GET", tiffImg);
    // xhr.responseType = "arraybuffer";
    // xhr.onload = async (e) => {
    //   const tiff = await fromArrayBuffer(e.target.response);
    //   setTiffData(tiff);
    // };
    // xhr.send();

    const getTiff = async () => {
      const tiff = await fromUrl(
        "https://storage4operations.blob.core.windows.net/indian/AP488/GIS/THERMAL/GEOREFERENCE/AP488_THERMAL_M9_-M12_REC.tif"
      );
      // const response = await fetch(
      //   "https://sandboxsigma.blob.core.windows.net/sigma/AP464/GIS/THERMAL/Radiometric_maps/Georeference/AP464_Thermal_M100-102_Modified.tif"
      // );
      // const arrayBuffer = await response.arrayBuffer();
      // const tiff = await fromArrayBuffer(arrayBuffer);
      setTiffData(tiff);
    };

    getTiff();
  }, []);

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
        style={{ height: `100vh`, width: `100vw` }}
        mapboxAccessToken="pk.eyJ1IjoiYWlycHJvYmUiLCJhIjoiY2tkcmVqbDF2MDVqbzJ0b3FmeTcxcHFrZSJ9.YQR_ZeBEF43y8pV2KKvHcg"
        initialViewState={viewState}
        mapStyle="mapbox://styles/mapbox/satellite-v9"
        onClick={handleMapClick}
        interactiveLayerIds={["rasterLayer"]}
        ref={mapRef}
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
      </ReactMapGl>
    </div>
  );
}

export default App;
