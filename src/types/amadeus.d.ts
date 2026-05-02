declare module 'amadeus' {
  interface AmadeusOptions {
    clientId: string
    clientSecret: string
  }

  type ParamValue = string | number | boolean | Record<string, string> | undefined

  interface GetParams {
    [key: string]: ParamValue
  }

  interface ApiResponse {
    data: unknown
    result: unknown
    status: number
  }

  interface Namespace {
    get(params?: GetParams): Promise<ApiResponse>
    post(params?: string): Promise<ApiResponse>
  }

  class Amadeus {
    constructor(options: AmadeusOptions)
    shopping: {
      flightOffersSearch: Namespace
    }
    referenceData: {
      locations: Namespace
    }
  }

  export default Amadeus
}
