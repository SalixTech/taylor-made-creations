'use client';

import {getTemplateText} from '@/owner/site-design';
import SiteSelect, {type SiteSelectProps} from './SiteSelect';
import {countryOptions} from './countries.js';

export default function CountryPicker(props:Omit<SiteSelectProps,'options'|'searchable'|'placeholder'>) {
  return <SiteSelect {...props} options={countryOptions} listLabel={getTemplateText(props.copyContent,"site.countryListLabel")} emptyMessage={getTemplateText(props.copyContent,"site.countryEmpty")} searchable placeholder={getTemplateText(props.copyContent,"site.countryPlaceholder")}/>;
}
