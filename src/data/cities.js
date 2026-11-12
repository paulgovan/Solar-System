// ~300 world cities for the observer picker: name, country, latitude (°N), longitude (°E) and
// IANA time zone. Coordinates are typed-in public geographic facts rounded to 0.01° (about
// 1 km), far finer than the sky needs: 0.1° of longitude shifts a rise time by 24 seconds.
// Nothing here comes from a licensed dataset.
//
// Each row: 'Name|Country|lat|lon|timezone'

const ROWS = `
Reykjavik|Iceland|64.15|-21.94|Atlantic/Reykjavik
London|United Kingdom|51.51|-0.13|Europe/London
Edinburgh|United Kingdom|55.95|-3.19|Europe/London
Manchester|United Kingdom|53.48|-2.24|Europe/London
Belfast|United Kingdom|54.60|-5.93|Europe/London
Dublin|Ireland|53.35|-6.26|Europe/Dublin
Cork|Ireland|51.90|-8.47|Europe/Dublin
Lisbon|Portugal|38.72|-9.14|Europe/Lisbon
Porto|Portugal|41.15|-8.61|Europe/Lisbon
Madrid|Spain|40.42|-3.70|Europe/Madrid
Barcelona|Spain|41.39|2.17|Europe/Madrid
Seville|Spain|37.39|-5.98|Europe/Madrid
Valencia|Spain|39.47|-0.38|Europe/Madrid
Las Palmas|Spain|28.12|-15.44|Atlantic/Canary
Paris|France|48.86|2.35|Europe/Paris
Marseille|France|43.30|5.37|Europe/Paris
Lyon|France|45.76|4.84|Europe/Paris
Brussels|Belgium|50.85|4.35|Europe/Brussels
Amsterdam|Netherlands|52.37|4.90|Europe/Amsterdam
Luxembourg|Luxembourg|49.61|6.13|Europe/Luxembourg
Berlin|Germany|52.52|13.40|Europe/Berlin
Hamburg|Germany|53.55|9.99|Europe/Berlin
Munich|Germany|48.14|11.58|Europe/Berlin
Frankfurt|Germany|50.11|8.68|Europe/Berlin
Zurich|Switzerland|47.38|8.54|Europe/Zurich
Geneva|Switzerland|46.20|6.14|Europe/Zurich
Vienna|Austria|48.21|16.37|Europe/Vienna
Prague|Czechia|50.08|14.44|Europe/Prague
Warsaw|Poland|52.23|21.01|Europe/Warsaw
Krakow|Poland|50.06|19.94|Europe/Warsaw
Budapest|Hungary|47.50|19.04|Europe/Budapest
Bratislava|Slovakia|48.15|17.11|Europe/Bratislava
Ljubljana|Slovenia|46.06|14.51|Europe/Ljubljana
Zagreb|Croatia|45.81|15.98|Europe/Zagreb
Belgrade|Serbia|44.79|20.45|Europe/Belgrade
Sarajevo|Bosnia and Herzegovina|43.86|18.41|Europe/Sarajevo
Skopje|North Macedonia|41.99|21.43|Europe/Skopje
Tirana|Albania|41.33|19.82|Europe/Tirane
Podgorica|Montenegro|42.44|19.26|Europe/Podgorica
Rome|Italy|41.90|12.50|Europe/Rome
Milan|Italy|45.46|9.19|Europe/Rome
Naples|Italy|40.85|14.27|Europe/Rome
Palermo|Italy|38.12|13.36|Europe/Rome
Valletta|Malta|35.90|14.51|Europe/Malta
Athens|Greece|37.98|23.73|Europe/Athens
Thessaloniki|Greece|40.64|22.94|Europe/Athens
Nicosia|Cyprus|35.19|33.38|Asia/Nicosia
Sofia|Bulgaria|42.70|23.32|Europe/Sofia
Bucharest|Romania|44.43|26.10|Europe/Bucharest
Chisinau|Moldova|47.01|28.86|Europe/Chisinau
Kyiv|Ukraine|50.45|30.52|Europe/Kyiv
Odesa|Ukraine|46.48|30.73|Europe/Kyiv
Minsk|Belarus|53.90|27.57|Europe/Minsk
Vilnius|Lithuania|54.69|25.28|Europe/Vilnius
Riga|Latvia|56.95|24.11|Europe/Riga
Tallinn|Estonia|59.44|24.75|Europe/Tallinn
Helsinki|Finland|60.17|24.94|Europe/Helsinki
Stockholm|Sweden|59.33|18.07|Europe/Stockholm
Gothenburg|Sweden|57.71|11.97|Europe/Stockholm
Oslo|Norway|59.91|10.75|Europe/Oslo
Tromso|Norway|69.65|18.96|Europe/Oslo
Copenhagen|Denmark|55.68|12.57|Europe/Copenhagen
Moscow|Russia|55.76|37.62|Europe/Moscow
Saint Petersburg|Russia|59.93|30.34|Europe/Moscow
Kaliningrad|Russia|54.71|20.51|Europe/Kaliningrad
Yekaterinburg|Russia|56.84|60.60|Asia/Yekaterinburg
Novosibirsk|Russia|55.03|82.92|Asia/Novosibirsk
Krasnoyarsk|Russia|56.01|92.85|Asia/Krasnoyarsk
Irkutsk|Russia|52.29|104.28|Asia/Irkutsk
Vladivostok|Russia|43.12|131.89|Asia/Vladivostok
Istanbul|Turkey|41.01|28.98|Europe/Istanbul
Ankara|Turkey|39.93|32.86|Europe/Istanbul
Izmir|Turkey|38.42|27.14|Europe/Istanbul
Tbilisi|Georgia|41.72|44.79|Asia/Tbilisi
Yerevan|Armenia|40.18|44.51|Asia/Yerevan
Baku|Azerbaijan|40.41|49.87|Asia/Baku
Tel Aviv|Israel|32.09|34.78|Asia/Jerusalem
Jerusalem|Israel|31.77|35.22|Asia/Jerusalem
Beirut|Lebanon|33.89|35.50|Asia/Beirut
Damascus|Syria|33.51|36.29|Asia/Damascus
Amman|Jordan|31.95|35.93|Asia/Amman
Baghdad|Iraq|33.31|44.36|Asia/Baghdad
Tehran|Iran|35.69|51.39|Asia/Tehran
Riyadh|Saudi Arabia|24.71|46.68|Asia/Riyadh
Jeddah|Saudi Arabia|21.54|39.17|Asia/Riyadh
Kuwait City|Kuwait|29.38|47.99|Asia/Kuwait
Doha|Qatar|25.29|51.53|Asia/Qatar
Dubai|United Arab Emirates|25.20|55.27|Asia/Dubai
Abu Dhabi|United Arab Emirates|24.45|54.38|Asia/Dubai
Muscat|Oman|23.59|58.41|Asia/Muscat
Sanaa|Yemen|15.37|44.19|Asia/Aden
Cairo|Egypt|30.04|31.24|Africa/Cairo
Alexandria|Egypt|31.20|29.92|Africa/Cairo
Tripoli|Libya|32.89|13.19|Africa/Tripoli
Tunis|Tunisia|36.81|10.18|Africa/Tunis
Algiers|Algeria|36.75|3.06|Africa/Algiers
Casablanca|Morocco|33.57|-7.59|Africa/Casablanca
Marrakesh|Morocco|31.63|-8.01|Africa/Casablanca
Khartoum|Sudan|15.50|32.56|Africa/Khartoum
Dakar|Senegal|14.72|-17.47|Africa/Dakar
Bamako|Mali|12.64|-8.00|Africa/Bamako
Accra|Ghana|5.60|-0.19|Africa/Accra
Abidjan|Ivory Coast|5.36|-4.01|Africa/Abidjan
Lagos|Nigeria|6.52|3.38|Africa/Lagos
Abuja|Nigeria|9.08|7.40|Africa/Lagos
Niamey|Niger|13.51|2.13|Africa/Niamey
Ndjamena|Chad|12.13|15.06|Africa/Ndjamena
Kinshasa|DR Congo|-4.44|15.27|Africa/Kinshasa
Luanda|Angola|-8.84|13.23|Africa/Luanda
Douala|Cameroon|4.05|9.77|Africa/Douala
Libreville|Gabon|0.42|9.47|Africa/Libreville
Addis Ababa|Ethiopia|9.03|38.74|Africa/Addis_Ababa
Nairobi|Kenya|-1.29|36.82|Africa/Nairobi
Kampala|Uganda|0.35|32.58|Africa/Kampala
Kigali|Rwanda|-1.95|30.06|Africa/Kigali
Dar es Salaam|Tanzania|-6.79|39.21|Africa/Dar_es_Salaam
Mogadishu|Somalia|2.05|45.32|Africa/Mogadishu
Lusaka|Zambia|-15.39|28.32|Africa/Lusaka
Harare|Zimbabwe|-17.83|31.05|Africa/Harare
Maputo|Mozambique|-25.97|32.57|Africa/Maputo
Antananarivo|Madagascar|-18.88|47.51|Indian/Antananarivo
Windhoek|Namibia|-22.56|17.08|Africa/Windhoek
Johannesburg|South Africa|-26.20|28.05|Africa/Johannesburg
Cape Town|South Africa|-33.92|18.42|Africa/Johannesburg
Durban|South Africa|-29.86|31.02|Africa/Johannesburg
Port Louis|Mauritius|-20.16|57.50|Indian/Mauritius
Tashkent|Uzbekistan|41.30|69.24|Asia/Tashkent
Almaty|Kazakhstan|43.24|76.89|Asia/Almaty
Astana|Kazakhstan|51.17|71.43|Asia/Almaty
Bishkek|Kyrgyzstan|42.87|74.59|Asia/Bishkek
Dushanbe|Tajikistan|38.56|68.77|Asia/Dushanbe
Ashgabat|Turkmenistan|37.96|58.33|Asia/Ashgabat
Kabul|Afghanistan|34.53|69.17|Asia/Kabul
Islamabad|Pakistan|33.68|73.05|Asia/Karachi
Karachi|Pakistan|24.86|67.00|Asia/Karachi
Lahore|Pakistan|31.55|74.34|Asia/Karachi
Delhi|India|28.61|77.21|Asia/Kolkata
Mumbai|India|19.08|72.88|Asia/Kolkata
Kolkata|India|22.57|88.36|Asia/Kolkata
Chennai|India|13.08|80.27|Asia/Kolkata
Bengaluru|India|12.97|77.59|Asia/Kolkata
Hyderabad|India|17.39|78.49|Asia/Kolkata
Ahmedabad|India|23.02|72.57|Asia/Kolkata
Kathmandu|Nepal|27.72|85.32|Asia/Kathmandu
Dhaka|Bangladesh|23.81|90.41|Asia/Dhaka
Thimphu|Bhutan|27.47|89.64|Asia/Thimphu
Colombo|Sri Lanka|6.93|79.86|Asia/Colombo
Male|Maldives|4.18|73.51|Indian/Maldives
Yangon|Myanmar|16.87|96.20|Asia/Yangon
Bangkok|Thailand|13.76|100.50|Asia/Bangkok
Chiang Mai|Thailand|18.79|98.98|Asia/Bangkok
Vientiane|Laos|17.97|102.63|Asia/Vientiane
Phnom Penh|Cambodia|11.56|104.93|Asia/Phnom_Penh
Hanoi|Vietnam|21.03|105.85|Asia/Ho_Chi_Minh
Ho Chi Minh City|Vietnam|10.82|106.63|Asia/Ho_Chi_Minh
Kuala Lumpur|Malaysia|3.14|101.69|Asia/Kuala_Lumpur
Singapore|Singapore|1.35|103.82|Asia/Singapore
Jakarta|Indonesia|-6.21|106.85|Asia/Jakarta
Surabaya|Indonesia|-7.25|112.75|Asia/Jakarta
Denpasar|Indonesia|-8.65|115.22|Asia/Makassar
Jayapura|Indonesia|-2.53|140.72|Asia/Jayapura
Manila|Philippines|14.60|120.98|Asia/Manila
Cebu|Philippines|10.32|123.89|Asia/Manila
Bandar Seri Begawan|Brunei|4.94|114.95|Asia/Brunei
Dili|Timor-Leste|-8.56|125.57|Asia/Dili
Hong Kong|China|22.32|114.17|Asia/Hong_Kong
Macau|China|22.20|113.55|Asia/Macau
Beijing|China|39.90|116.41|Asia/Shanghai
Shanghai|China|31.23|121.47|Asia/Shanghai
Guangzhou|China|23.13|113.26|Asia/Shanghai
Shenzhen|China|22.54|114.06|Asia/Shanghai
Chengdu|China|30.57|104.07|Asia/Shanghai
Wuhan|China|30.59|114.31|Asia/Shanghai
Xi'an|China|34.34|108.94|Asia/Shanghai
Harbin|China|45.80|126.53|Asia/Shanghai
Lhasa|China|29.65|91.12|Asia/Shanghai
Urumqi|China|43.83|87.62|Asia/Urumqi
Taipei|Taiwan|25.03|121.57|Asia/Taipei
Seoul|South Korea|37.57|126.98|Asia/Seoul
Busan|South Korea|35.18|129.08|Asia/Seoul
Pyongyang|North Korea|39.04|125.76|Asia/Pyongyang
Ulaanbaatar|Mongolia|47.89|106.91|Asia/Ulaanbaatar
Tokyo|Japan|35.68|139.69|Asia/Tokyo
Osaka|Japan|34.69|135.50|Asia/Tokyo
Kyoto|Japan|35.01|135.77|Asia/Tokyo
Sapporo|Japan|43.06|141.35|Asia/Tokyo
Fukuoka|Japan|33.59|130.40|Asia/Tokyo
Naha|Japan|26.21|127.68|Asia/Tokyo
Perth|Australia|-31.95|115.86|Australia/Perth
Darwin|Australia|-12.46|130.84|Australia/Darwin
Adelaide|Australia|-34.93|138.60|Australia/Adelaide
Alice Springs|Australia|-23.70|133.88|Australia/Darwin
Brisbane|Australia|-27.47|153.03|Australia/Brisbane
Sydney|Australia|-33.87|151.21|Australia/Sydney
Canberra|Australia|-35.28|149.13|Australia/Sydney
Melbourne|Australia|-37.81|144.96|Australia/Melbourne
Hobart|Australia|-42.88|147.33|Australia/Hobart
Auckland|New Zealand|-36.85|174.76|Pacific/Auckland
Wellington|New Zealand|-41.29|174.78|Pacific/Auckland
Christchurch|New Zealand|-43.53|172.64|Pacific/Auckland
Queenstown|New Zealand|-45.03|168.66|Pacific/Auckland
Port Moresby|Papua New Guinea|-9.44|147.18|Pacific/Port_Moresby
Noumea|New Caledonia|-22.27|166.45|Pacific/Noumea
Suva|Fiji|-18.14|178.44|Pacific/Fiji
Apia|Samoa|-13.83|-171.76|Pacific/Apia
Nukualofa|Tonga|-21.14|-175.20|Pacific/Tongatapu
Papeete|French Polynesia|-17.54|-149.57|Pacific/Tahiti
Honolulu|United States|21.31|-157.86|Pacific/Honolulu
Hilo|United States|19.71|-155.08|Pacific/Honolulu
Anchorage|United States|61.22|-149.90|America/Anchorage
Fairbanks|United States|64.84|-147.72|America/Anchorage
Juneau|United States|58.30|-134.42|America/Juneau
Seattle|United States|47.61|-122.33|America/Los_Angeles
Portland|United States|45.52|-122.68|America/Los_Angeles
San Francisco|United States|37.77|-122.42|America/Los_Angeles
Los Angeles|United States|34.05|-118.24|America/Los_Angeles
San Diego|United States|32.72|-117.16|America/Los_Angeles
Las Vegas|United States|36.17|-115.14|America/Los_Angeles
Phoenix|United States|33.45|-112.07|America/Phoenix
Tucson|United States|32.22|-110.97|America/Phoenix
Salt Lake City|United States|40.76|-111.89|America/Denver
Boise|United States|43.62|-116.20|America/Boise
Denver|United States|39.74|-104.99|America/Denver
Albuquerque|United States|35.08|-106.65|America/Denver
Helena|United States|46.59|-112.04|America/Denver
Dallas|United States|32.78|-96.80|America/Chicago
Houston|United States|29.76|-95.37|America/Chicago
Austin|United States|30.27|-97.74|America/Chicago
San Antonio|United States|29.42|-98.49|America/Chicago
Oklahoma City|United States|35.47|-97.52|America/Chicago
Kansas City|United States|39.10|-94.58|America/Chicago
Minneapolis|United States|44.98|-93.27|America/Chicago
Chicago|United States|41.88|-87.63|America/Chicago
St. Louis|United States|38.63|-90.20|America/Chicago
New Orleans|United States|29.95|-90.07|America/Chicago
Memphis|United States|35.15|-90.05|America/Chicago
Nashville|United States|36.16|-86.78|America/Chicago
Detroit|United States|42.33|-83.05|America/Detroit
Indianapolis|United States|39.77|-86.16|America/Indiana/Indianapolis
Cleveland|United States|41.50|-81.69|America/New_York
Atlanta|United States|33.75|-84.39|America/New_York
Miami|United States|25.76|-80.19|America/New_York
Orlando|United States|28.54|-81.38|America/New_York
Charlotte|United States|35.23|-80.84|America/New_York
Washington, D.C.|United States|38.91|-77.04|America/New_York
Philadelphia|United States|39.95|-75.17|America/New_York
Pittsburgh|United States|40.44|-80.00|America/New_York
New York|United States|40.71|-74.01|America/New_York
Boston|United States|42.36|-71.06|America/New_York
Burlington|United States|44.48|-73.21|America/New_York
Vancouver|Canada|49.28|-123.12|America/Vancouver
Calgary|Canada|51.05|-114.07|America/Edmonton
Edmonton|Canada|53.55|-113.49|America/Edmonton
Saskatoon|Canada|52.13|-106.67|America/Regina
Winnipeg|Canada|49.90|-97.14|America/Winnipeg
Toronto|Canada|43.65|-79.38|America/Toronto
Ottawa|Canada|45.42|-75.70|America/Toronto
Montreal|Canada|45.50|-73.57|America/Toronto
Quebec City|Canada|46.81|-71.21|America/Toronto
Halifax|Canada|44.65|-63.57|America/Halifax
St. John's|Canada|47.56|-52.71|America/St_Johns
Yellowknife|Canada|62.45|-114.37|America/Yellowknife
Whitehorse|Canada|60.72|-135.06|America/Whitehorse
Iqaluit|Canada|63.75|-68.52|America/Iqaluit
Nuuk|Greenland|64.18|-51.72|America/Nuuk
Mexico City|Mexico|19.43|-99.13|America/Mexico_City
Guadalajara|Mexico|20.67|-103.35|America/Mexico_City
Monterrey|Mexico|25.69|-100.32|America/Monterrey
Tijuana|Mexico|32.51|-117.04|America/Tijuana
Merida|Mexico|20.97|-89.62|America/Merida
Guatemala City|Guatemala|14.63|-90.51|America/Guatemala
San Salvador|El Salvador|13.69|-89.19|America/El_Salvador
Tegucigalpa|Honduras|14.07|-87.19|America/Tegucigalpa
Managua|Nicaragua|12.11|-86.24|America/Managua
San Jose|Costa Rica|9.93|-84.08|America/Costa_Rica
Panama City|Panama|8.98|-79.52|America/Panama
Havana|Cuba|23.11|-82.37|America/Havana
Kingston|Jamaica|18.00|-76.79|America/Jamaica
Port-au-Prince|Haiti|18.54|-72.34|America/Port-au-Prince
Santo Domingo|Dominican Republic|18.49|-69.93|America/Santo_Domingo
San Juan|Puerto Rico|18.47|-66.12|America/Puerto_Rico
Nassau|Bahamas|25.05|-77.36|America/Nassau
Bogota|Colombia|4.71|-74.07|America/Bogota
Medellin|Colombia|6.24|-75.58|America/Bogota
Caracas|Venezuela|10.48|-66.90|America/Caracas
Quito|Ecuador|-0.18|-78.47|America/Guayaquil
Guayaquil|Ecuador|-2.17|-79.92|America/Guayaquil
Lima|Peru|-12.05|-77.04|America/Lima
Cusco|Peru|-13.53|-71.97|America/Lima
La Paz|Bolivia|-16.50|-68.15|America/La_Paz
Santa Cruz|Bolivia|-17.78|-63.18|America/La_Paz
Asuncion|Paraguay|-25.26|-57.58|America/Asuncion
Manaus|Brazil|-3.12|-60.02|America/Manaus
Brasilia|Brazil|-15.79|-47.88|America/Sao_Paulo
Sao Paulo|Brazil|-23.55|-46.63|America/Sao_Paulo
Rio de Janeiro|Brazil|-22.91|-43.17|America/Sao_Paulo
Salvador|Brazil|-12.97|-38.50|America/Bahia
Fortaleza|Brazil|-3.73|-38.52|America/Fortaleza
Recife|Brazil|-8.05|-34.88|America/Recife
Porto Alegre|Brazil|-30.03|-51.23|America/Sao_Paulo
Montevideo|Uruguay|-34.90|-56.16|America/Montevideo
Buenos Aires|Argentina|-34.60|-58.38|America/Argentina/Buenos_Aires
Cordoba|Argentina|-31.42|-64.18|America/Argentina/Cordoba
Mendoza|Argentina|-32.89|-68.83|America/Argentina/Mendoza
Ushuaia|Argentina|-54.80|-68.30|America/Argentina/Ushuaia
Santiago|Chile|-33.45|-70.67|America/Santiago
Punta Arenas|Chile|-53.16|-70.91|America/Punta_Arenas
San Pedro de Atacama|Chile|-22.91|-68.20|America/Santiago
Easter Island|Chile|-27.11|-109.35|Pacific/Easter
Stanley|Falkland Islands|-51.70|-57.85|Atlantic/Stanley
Cayenne|French Guiana|4.94|-52.33|America/Cayenne
Paramaribo|Suriname|5.85|-55.20|America/Paramaribo
Georgetown|Guyana|6.80|-58.16|America/Guyana
Ponta Delgada|Portugal|37.74|-25.67|Atlantic/Azores
Funchal|Portugal|32.65|-16.91|Atlantic/Madeira
Praia|Cape Verde|14.93|-23.51|Atlantic/Cape_Verde
Longyearbyen|Norway|78.22|15.65|Arctic/Longyearbyen
McMurdo Station|Antarctica|-77.85|166.67|Antarctica/McMurdo
`;

export const CITIES = ROWS.trim().split('\n').map((line) => {
  const [name, country, lat, lon, tz] = line.split('|');
  return { name, country, lat: Number(lat), lon: Number(lon), tz };
});
