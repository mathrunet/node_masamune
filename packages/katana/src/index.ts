/**
 * Copyright (c) 2025 mathru. All rights reserved.
 * 
 * Base library that stores the base classes and similar components of the server-side Masamune framework.
 * 
 * To use, import * as katana from "@mathrunet/katana";
 *
 * [mathru.net]: https://mathru.net
 * [YouTube]: https://www.youtube.com/c/mathrunetchannel
 */
export * from "./lib/api";
export * from "./lib/regions";
export * as utils from "./lib/utils";

export * from "./lib/src/firebase_loader";
export * from "./lib/src/functions_base";
export * from "./lib/src/functions_data";
export * as firestore from "./lib/src/firestore_base";
export * from "./lib/src/sql_api_base";
export * from "./lib/src/call_process_function_base";
export * from "./lib/src/firestore_triggered_process_function_base";
export * from "./lib/src/request_process_function_base";
export * from "./lib/src/schedule_process_function_base";

export * from "./lib/model_field_value/model_field_value";
export * from "./lib/model_field_value/default_firestore_model_field_value_converter";

export * from "./lib/exntensions/string.extension";
