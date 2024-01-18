import { FirestoreModelFieldValueConverter } from "./firestore_model_field_value_converter";
import { FirestoreModelCommandBaseConverter } from "../converter/firestore_model_command_base_converter";
import { FirestoreModelCounterConverter } from "../converter/firestore_model_counter_converter";
import { FirestoreModelTimestampConverter } from "../converter/firestore_model_timestamp_converter";
import { FirestoreModelDateConverter } from "../converter/firestore_model_date_converter";
import { FirestoreModelLocaleConverter } from "../converter/firestore_model_locale_converter";
import { FirestoreModelLocalizedValueConverter } from "../converter/firestore_model_localized_value_converter";
import { FirestoreModelUriConverter } from "../converter/firestore_model_uri_converter";
import { FirestoreModelImageUriConverter } from "../converter/firestore_model_image_uri_converter";
import { FirestoreBasicConverter } from "../converter/firestore_basic_converter";
import { FirestoreEnumConverter } from "../converter/firestore_enum_converter";
import { FirestoreModelGeoValueConverter } from "../converter/firestore_model_geo_value_converter";
import { FirestoreModelRefConverter } from "../converter/firestore_model_ref_converter";
import { FirestoreModelSearchConverter } from "../converter/firestore_model_search_converter";
import { FirestoreModelTokenConverter } from "../converter/firestore_model_token_converter";
import { FirestoreModelVideoUriConverter } from "../converter/firestore_model_video_uri_converter";
import { FirestoreNullConverter } from "../converter/firestore_null_converter";

/**
 * List of converters for converting Firestore values.
 * 
 * Firestoreの値を変換するためのコンバーター一覧。
 */
const defaultConverters: FirestoreModelFieldValueConverter[] = [
    new FirestoreModelCommandBaseConverter(),
    new FirestoreModelCounterConverter(),
    new FirestoreModelTimestampConverter(),
    new FirestoreModelDateConverter(),
    new FirestoreModelLocaleConverter(),
    new FirestoreModelLocalizedValueConverter(),
    new FirestoreModelUriConverter(),
    new FirestoreModelImageUriConverter(),
    new FirestoreModelVideoUriConverter(),
    new FirestoreModelSearchConverter(),
    new FirestoreModelTokenConverter(),
    new FirestoreModelGeoValueConverter(),
    new FirestoreModelRefConverter(),
    new FirestoreEnumConverter(),
    new FirestoreNullConverter(),
    new FirestoreBasicConverter(),
];
export { defaultConverters }