/** Cities offered in the UI. Used to disambiguate place names like "Sector 62" or "Camac Street". */
export const CITIES = [
  'Kolkata', 'Delhi NCR', 'Mumbai', 'Bengaluru', 'Chennai', 'Hyderabad', 'Pune', 'Ahmedabad', 'Other',
] as const;
export type City = (typeof CITIES)[number];
export const DEFAULT_CITY: City = 'Kolkata';

export function parseCity(value: unknown): City {
  return CITIES.includes(value as City) ? (value as City) : DEFAULT_CITY;
}

/** Appends the city to a place name unless the user already named a city / "Other" is selected. */
export function withCity(place: string, city: City): string {
  if (city === 'Other') return place;
  const first = city.split(' ')[0].toLowerCase();
  return place.toLowerCase().includes(first) ? place : `${place}, ${city}`;
}
