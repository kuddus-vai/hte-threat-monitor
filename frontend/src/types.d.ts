declare module "world-atlas/countries-110m.json" {
  const value: { objects: { countries: unknown } };
  export default value;
}

declare module "topojson-client" {
  export function feature(topology: any, object: any): any;
  export function mesh(topology: any, object: any, filter?: any): any;
  export function merge(topology: any, objects: any): any;
}
