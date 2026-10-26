'use client';

import SiteSelect, {type SiteSelectProps} from './SiteSelect';
import {countryOptions} from './countries.js';

export default function CountryPicker(props:Omit<SiteSelectProps,'options'|'searchable'|'placeholder'>) {
  return <SiteSelect {...props} options={countryOptions} listLabel="Countries" emptyMessage="No countries found. Try another name or country code." searchable placeholder="Search for your country…"/>;
}
