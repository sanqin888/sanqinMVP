/** JSON values are owned by the application boundary, not by the ORM. */
export type UberJsonValue =
  | string
  | number
  | boolean
  | null
  | UberJsonValue[]
  | { [key: string]: UberJsonValue };
