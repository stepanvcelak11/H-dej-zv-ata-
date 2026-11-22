/* Tematické balíčky – výběr zvířat a míst podle tématu. */
(function () {
  'use strict';
  const ids = s => s.trim().split(/\s+/);

  window.PACKS = {
    animals: [
      { id: 'all', label: 'Všechna zvířata', img: 'tygr', desc: 'Všechno z celého světa' },
      {
        id: 'cz', label: 'Česká příroda', img: 'jezek-zapadni', desc: 'Co potkáš v lese, u rybníka i na zahradě',
        inatPlace: 8264, // iNaturalist: Česko
        ids: ids(`vlk-obecny liska-obecna rys-ostrovid jelen-evropsky srnec-obecny prase-divoke jezek-zapadni veverka-obecna
          bobr-evropsky vydra-ricni jezevec-lesni zajic-polni krecek-polni mys-domaci potkan-obecny krtek-obecny kuna-skalni
          lasice-hranostaj sova-palena vyr-velky lednacek-ricni strakapoud-velky cap-bily labut-velka kachna-divoka husa-velka
          volavka-popelava holub-skalni vrabec-domaci sykora-konadra kos-cerny straka-obecna havran-polni vlastovka-obecna
          cervenka-obecna bazant-obecny kukacka-obecna jerab-popelavy orel-skalni uzovka-obojkova zmije-obecna jesterka-obecna
          skokan-hnedy ropucha-obecna rosnicka-zelena mlok-skvrnity colek-velky pstruh-obecny kapr-obecny stika-obecna sumec-velky
          vcela-medonosna cmelak-zemni vosa-obecna mravenec-lesni slunecko-sedmitecne rohac-obecny otakarek-fenyklovy
          babocka-pavi-oko sidlo-modre kudlanka-nabozna kobylka-zelena cvrcek-polni rumenice-pospolna chroust-obecny
          moucha-domaci krizak-obecny kliste-obecne hlemyzd-zahradni plzak-spanelsky rak-ricni zizala-obecna`),
      },
      {
        id: 'farm', label: 'Domácí a farma', img: 'koza-domaci', desc: 'Mazlíčci a zvířata ze statku',
        ids: ids(`kocka-domaci pes-domaci kun-domaci tur-domaci prase-domaci ovce-domaci koza-domaci kralik-divoky kur-domaci
          krocan-divoky kachna-divoka husa-velka holub-skalni andulka-vlnkovana karas-zlaty lama-krotka alpaka dromedar
          velbloud-dvouhrby vcela-medonosna mys-domaci krecek-polni agama-vousata`),
      },
      {
        id: 'safari', label: 'Safari', img: 'zirafa', desc: 'Africká savana a džungle',
        ids: ids(`zebra-stepni levhart lev gepard zirafa slon-africky hroch-obojzivelny nosorozec-dvourohy gorila-zapadni
          simpanz-ucenlivy surikata hyena-skvrnita pakun-zihany okapi mandril-ryholici hrabac-kapsky impala buvol-africky
          pstros-dvouprsty plamenak-ruzovy krokodyl-nilsky fenek-berbersky dromedar lemur-kata pelikan-bily sup-belohlavy
          chameleon-jemensky stir-cisarsky dikobraz-obecny`),
      },
      {
        id: 'sea', label: 'Moře a oceány', img: 'klaun-ockaty', desc: 'Pod hladinou i na pobřeží',
        ids: ids(`delfin-skakavy kosatka-drava keporkak tulen-obecny mroz-ledni lachtan-kalifornsky tucnak-cisarsky
          papuchalk-severni albatros-stehovavy zralok-bily kladivoun-velky manta-obrovska klaun-ockaty konicek-morsky
          jezik-fourkovany murena-zelena mecoun-obecny perutyn-ohnivy tunak-obecny losos-obecny kareta-obecna
          chobotnice-pobrezni sepie-obecna lodenka-hlubinna humr-evropsky krab-pobrezni kreveta talirovka-usata
          hvezdice-cervena jezovka-purpurova medved-ledni pelikan-bily`),
      },
      {
        id: 'exotic', label: 'Exotika', img: 'tukan-obrovsky', desc: 'Pralesy, Austrálie a vzdálené ostrovy',
        ids: ids(`koala-medvidkovity klokan-rudy vombat-obecny ptakopysk-podivny jezura-australska dabel-medvedovity emu-hnedy
          kakadu-zlutocecelaty kiwi-mantelluv moloch-ostnity agama-vousata varan-komodsky zelva-sloni lenochod-hnedokrky
          mravenecnik-velky pasovec-devitipasy tukan-obrovsky ara-arakanga kolibrik-rubinohrdly jaguar ocelot-velky kapybara
          tapir-cabrakovy orangutan-bornejsky panda-velka panda-cervena tygr kalon-indicky pav-korunkaty leguan-zeleny
          bazilisek-zeleny pralesnicka-barvirska listovnice-cervenooka axolotl-mexicky pirana-natterova gekon-obrovsky
          krajta-mrizkovana kobra-indicka sklipkan monarcha-stehovavy`),
      },
      {
        id: 'cold', label: 'Sever a hory', img: 'liska-polarni', desc: 'Sníh, led a vysoké hory',
        ids: ids(`medved-ledni liska-polarni sob-polarni los-evropsky mroz-ledni sovice-snezni tucnak-cisarsky irbis-horsky
          kozorozec-horsky lasice-hranostaj vlk-obecny medved-hnedy bizon-americky zubr-evropsky orel-skalni puma-americka
          papuchalk-severni tulen-obecny losos-obecny velbloud-dvouhrby orel-belohlavy`),
      },
    ],
    landmarks: [
      { id: 'all', label: 'Všechna místa', img: 'koloseum', desc: 'Celý svět' },
      { id: 'cz', label: 'Česko', img: 'karluv-most', desc: 'Hrady, mosty a hory u nás', test: it => it.country === 'Česko' },
      { id: 'nature', label: 'Přírodní divy', img: 'grand-canyon', desc: 'Hory, vodopády, kaňony', test: it => it.kind === 'příroda' },
      { id: 'build', label: 'Slavné stavby', img: 'eiffelova-vez', desc: 'Věže, chrámy a paláce', test: it => it.kind === 'stavba' },
    ],
  };
})();
