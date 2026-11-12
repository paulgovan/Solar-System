// Source imagery for the real-surface maps (all NASA / USGS public domain).
// `rows` marks a huge uncompressed USGS TIFF that is fetched row-subsampled.

export const SRC_DIR = 'imagery-src';
export const OUT_DIR = 'public/textures';

const EO = 'https://assets.science.nasa.gov/content/dam/science/esd/eo';
const USGS = 'https://planetarymaps.usgs.gov/mosaic';
const SVS = 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720';

export const SOURCES = [
  { id: 'earth-day', file: 'world.200407.3x5400x2700.jpg', url: `${EO}/images/bmng/bmng-base/july/world.200407.3x5400x2700.jpg` },
  { id: 'earth-night', file: 'BlackMarble_2016_3km.jpg', url: `${EO}/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg` },
  { id: 'earth-clouds', file: 'cloud_combined_2048.jpg', url: `${EO}/content-feature/bluemarble/images/cloud_combined_2048.jpg` },
  { id: 'moon', file: 'lroc_color_poles_4k.tif', url: `${SVS}/lroc_color_poles_4k.tif` },
  { id: 'moon-height', file: 'ldem_3_8bit.jpg', url: `${SVS}/ldem_3_8bit.jpg` },
  { id: 'mercury', file: 'mercury_mdis_bdr_rows.png', url: `${USGS}/Mercury_MESSENGER_MDIS_Basemap_BDR_Mosaic_Global_166m.tif`, rows: 1024 },
  { id: 'mars', file: 'mars_viking_clr_rows.png', url: `${USGS}/Mars_Viking_ClrMosaic_global_925m.tif`, rows: 1024 },
  { id: 'jupiter', file: 'PIA07782.tif', url: 'https://assets.science.nasa.gov/content/dam/science/psd/photojournal/pia/pia07/pia07782/PIA07782.tif' },
  { id: 'pluto', file: 'pluto_nh_rows.png', url: `${USGS}/Pluto_NewHorizons_Global_Mosaic_300m_Jul2017_8bit.tif`, rows: 1024 },
];
