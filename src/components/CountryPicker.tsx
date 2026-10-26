'use client';

import SiteSelect, {type SiteSelectProps} from './SiteSelect';
import {countryOptions} from './countries.js';

export default function CountryPicker(props:Omit<SiteSelectProps,'options'|'searchable'|'placeholder'>) {
  return <SiteSelect {...props} options={countryOptions} searchable placeholder="Search for your country…"/>;
}
