import "./App.css";
import "mapbox-gl/dist/mapbox-gl.css";

import * as geokeysToProj4 from "geotiff-geokeys-to-proj4";

import ReactMapGl, { Layer, Source } from "react-map-gl";
import { useEffect, useRef, useState } from "react";

import { fromUrl } from "geotiff";
import proj4 from "proj4";

function App() {
  const [viewState] = useState({
    longitude: 71.99473306070817,
    latitude: 27.458053548258803,
    zoom: 19,
  });
  const [tiffData, setTiffData] = useState();
  const mapRef = useRef();

  const handleMapClick = async (e) => {
    console.log(e);
    var image = await tiffData.getImage();
    const geoKeys = image.getGeoKeys();
    const projObj = geokeysToProj4.toProj4(geoKeys);
    const projection = proj4(`WGS84`, projObj.proj4);

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
        "https://sandboxsigma.blob.core.windows.net/sigma/AP464/GIS/THERMAL/Radiometric_maps/AP464_Thermal_M100-102.tif"
      );
      setTiffData(tiff);
    };
    getTiff();
  }, []);

  return (
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
        url={"mapbox://airprobe.12i1mxdb"}
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
  );
}

export default App;
