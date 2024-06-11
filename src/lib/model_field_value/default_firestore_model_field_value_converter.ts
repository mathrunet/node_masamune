import { FirestoreModelFieldValueConverter } from "./firestore_model_field_value_converter";
import { FirestoreModelCommandBaseConverter } from "./converters/firestore_model_command_base_converter";
import { FirestoreModelCounterConverter } from "./converters/firestore_model_counter_converter";
import { FirestoreModelTimestampConverter } from "./converters/firestore_model_timestamp_converter";
import { FirestoreModelDateConverter } from "./converters/firestore_model_date_converter";
import { FirestoreModelLocaleConverter } from "./converters/firestore_model_locale_converter";
import { FirestoreModelLocalizedValueConverter } from "./converters/firestore_model_localized_value_converter";
import { FirestoreModelUriConverter } from "./converters/firestore_model_uri_converter";
import { FirestoreModelImageUriConverter } from "./converters/firestore_model_image_uri_converter";
import { FirestoreBasicConverter } from "./converters/firestore_basic_converter";
import { FirestoreEnumConverter } from "./converters/firestore_enum_converter";
import { FirestoreModelGeoValueConverter } from "./converters/firestore_model_geo_value_converter";
import { FirestoreModelRefConverter } from "./converters/firestore_model_ref_converter";
import { FirestoreModelSearchConverter } from "./converters/firestore_model_search_converter";
import { FirestoreModelTokenConverter } from "./converters/firestore_model_token_converter";
import { FirestoreModelVideoUriConverter } from "./converters/firestore_model_video_uri_converter";
import { FirestoreNullConverter } from "./converters/firestore_null_converter";

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