import type { DataSource } from '../types/planner'
import type { StockPhysicalReference } from './stockPhysics'

export const rssConfigCommit = '75139b961567f4dab61af83fe162a7e52026558b'
export const rssConfigBase = `https://github.com/KSP-RO/RealSolarSystem/blob/${rssConfigCommit}/GameData/RealSolarSystem/RSSKopernicus`
export const rssPhysicsSource: DataSource = {
  id: 'rss-physical-reference',
  title: 'Official RSS physical and orbital constants · pinned revision',
  url: `https://github.com/KSP-RO/RealSolarSystem/tree/${rssConfigCommit}/GameData/RealSolarSystem/RSSKopernicus`,
}
export const rssCentralMu = Number('1.3271244004193938e20')

export interface RssPhysicalReference extends StockPhysicalReference {
  sphereOfInfluenceM: number
  /** Path relative to the pinned RSSKopernicus directory. */
  configPath: string
}

type PhysicalRow = readonly [bodyId: string, parentBodyId: string, radiusM: number,
  gravitationalParameter: number, atmosphereHeightM: number, semiMajorAxisM: number,
  eccentricity: number, inclinationDeg: number, longitudeOfAscendingNodeDeg: number,
  configPath: string, sphereOfInfluenceOverrideM?: number]

// Reorganized numerical facts from the pinned RSS configs. Giant radii include
// the active *_Oblate.cfg multipliers. Titan uses its final gravity assignment.
// Orbital angles share their source reference frame; they are not all zero or
// interchangeable with a body's equator. Sibling models compare orbital planes.
const rows: readonly PhysicalRow[] = [
  ['rss:ariel', 'rss:uranus', 578900, 83463444317.70477, 0, 190944364.477622, 0.00190951361476287, 74.8989043025419, 166.5671084714081, 'Uranus/Ariel.cfg'],
  ['rss:callisto', 'rss:jupiter', 2409300, 7179289361397.27, 0, 1883812366.573522, 0.007973319796896609, 25.44080019822134, 358.5022563372704, 'Jupiter/Callisto.cfg'],
  ['rss:ceres', 'rss:sun', 473000, 62632500000, 0, 413738762313.173, 0.079363494880566, 27.1273394923134, 23.4501727740666, 'Ceres/Ceres.cfg'],
  ['rss:charon', 'rss:pluto', 603500, 105879988860.1881, 0, 19596193.83540397, 0.00005082225659448947, 0.001, 222.4053735570010, 'Pluto/Charon.cfg'],
  ['rss:deimos', 'rss:mars', 5456, 96155.69648120314, 0, 23458112.01759387, 0.0003294680798661700, 38.2773701383231, 47.51893570799763, 'Mars/Deimos.cfg', 45000],
  ['rss:dione', 'rss:saturn', 561400, 73116366487.32, 0, 377650651.501709, 0.001679230905502774, 0.028, 128.5606071129818, 'Saturn/Dione.cfg'],
  ['rss:earth', 'rss:sun', 6371000, 398600435436096, 140000, 149598261150.4425, 0.01609636160505683, 23.44603795469773, 359.9965004168758, 'Earth/Earth.cfg'],
  ['rss:enceladus', 'rss:saturn', 252100, 7211454165.826, 0, 238413699.4838728, 0.006227897999957464, 0.009, 128.4244161601446, 'Saturn/Enceladus.cfg'],
  ['rss:europa', 'rss:jupiter', 1550800, 3202738774922.892, 0, 671253637.5417169, 0.009511727119926178, 25.70364276471991, 358.9360081847504, 'Jupiter/Europa.cfg'],
  ['rss:ganymede', 'rss:jupiter', 2624100, 9887834453334.145, 0, 1070823468.894524, 0.001190086418361844, 25.27071366962049, 358.0125219248113, 'Jupiter/Ganymede.cfg'],
  ['rss:iapetus', 'rss:saturn', 734500, 120512088703.3, 0, 3560162593.02297, 0.02880286281969610, 7.489, 50.29392880240187, 'Saturn/Iapetus.cfg'],
  ['rss:io', 'rss:jupiter', 1811300, 5959916033410.404, 0, 422018294.5236953, 0.003545858426216978, 25.46409538664874, 358.0466431678460, 'Jupiter/Io.cfg'],
  ['rss:jupiter', 'rss:sun', 69373000 * 1.02261446696514, 126686534921800800, 1550000, 778188938659.7554, 0.04872660654702194, 23.25313306947884, 3.262077289923354, 'Jupiter/Jupiter.cfg'],
  ['rss:mars', 'rss:sun', 3375800, 42828373620699.09, 125000, 227949699961.9763, 0.09326110278323557, 24.69272426910055, 3.351911063089117, 'Mars/Mars.cfg'],
  ['rss:mercury', 'rss:sun', 2439700, 22031780000000.02, 0, 57908973645.88802, 0.2056187266319207, 28.60252108855048, 10.86541167564728, 'Mercury/Mercury.cfg'],
  ['rss:mimas', 'rss:saturn', 198200, 2503524000, 0, 186009285.922049, 0.01776275223147744, 1.572, 139.7604722490289, 'Saturn/Mimas.cfg', 396000],
  ['rss:miranda', 'rss:uranus', 235700, 4319516899.2321, 0, 129880047.634175, 0.00118741261963413, 78.5887546839913, 169.0642120548280, 'Uranus/Miranda.cfg'],
  ['rss:moon', 'rss:earth', 1737100, 4902800066163.796, 0, 384308437.7707066, 0.05328149353682574, 28.36267790798491, 2.296616161126016, 'Earth/Moon.cfg'],
  ['rss:neptune', 'rss:sun', 24085000 * 1.00576720006498, 6835099502439672, 1250000, 4497455832811.736, 0.008090397688364061, 22.30735942964904, 3.512610711801178, 'Neptune/Neptune.cfg'],
  ['rss:oberon', 'rss:uranus', 761400, 205323430253.5623, 0, 583435328.340603, 0.00110558297330948, 74.9349049752716, 166.6887328903476, 'Uranus/Oberon.cfg'],
  ['rss:phobos', 'rss:mars', 7250, 708754.6066894452, 0, 9378492.209088314, 0.01539938155583979, 36.32433410471867, 46.48212553464923, 'Mars/Phobos.cfg', 47000],
  ['rss:pluto', 'rss:sun', 1187000, 869613817760.8748, 110000, 5845670624078.223, 0.2462772488425983, 23.61236405752844, 44.36099836994975, 'Pluto/Pluto.cfg'],
  ['rss:rhea', 'rss:saturn', 763800, 153942464353.5, 0, 527212645.707199, 0.001168269515756326, 0.331, 130.3670574820431, 'Saturn/Rhea.cfg'],
  ['rss:saturn', 'rss:sun', 57216000 * 1.03496359390026, 37931207498652240, 2000000, 1424838758613.269, 0.05347166506749872, 22.56992281132335, 5.970845343832233, 'Saturn/Saturn.cfg'],
  ['rss:tethys', 'rss:saturn', 531100, 41211077826.41, 0, 294973462.3804425, 0.001064868868083566, 1.091, 119.2518388332899, 'Saturn/Tethys.cfg'],
  ['rss:titan', 'rss:saturn', 2573300, 8977864800000, 600000, 1221966238.511425, 0.02891936561555365, 6.460492679775526, 126.4945233702913, 'Saturn/Titan.cfg'],
  ['rss:titania', 'rss:uranus', 788900, 226943700374.1248, 0, 436292682.967703, 0.002486916, 75.045766393, 166.6555214910122, 'Uranus/Titania.cfg'],
  ['rss:triton', 'rss:neptune', 1353400, 1427598140725.034, 110000, 354767243.5406647, 0.0001688014359763687, 156.834, 197.1953239788069, 'Neptune/Triton.cfg'],
  ['rss:umbriel', 'rss:uranus', 584700, 85093380944.89388, 0, 265992360.127656, 0.0038334454580725, 74.9939984108702, 166.5601075193709, 'Uranus/Umbriel.cfg'],
  ['rss:uranus', 'rss:sun', 24702000 * 1.00776752622033, 5793951322279009, 1400000, 2866832853163.975, 0.04620653158718433, 23.67256993343676, 1.846089669223938, 'Uranus/Uranus.cfg'],
  ['rss:venus', 'rss:sun', 6049000, 324858592000000.06, 145000, 108209548790.4671, 0.006810339650842032, 24.46397633556437, 7.981603378781639, 'Venus/Venus.cfg'],
  ['rss:vesta', 'rss:sun', 262700, 17288244969.3, 0, 353346223803.158, 0.0902068412255369, 22.7696439720361, 18.1671232653234, 'Vesta/Vesta.cfg'],
]

const parentMu = new Map<string, number>([
  ['rss:sun', rssCentralMu],
  ...rows.map(row => [row[0], row[3]] as const),
])

/** Default Kopernicus SOI floors apply only when no explicit override exists. */
export const rssPhysicalReferences: readonly RssPhysicalReference[] = rows.map(([
  bodyId, parentBodyId, radiusM, gravitationalParameter, atmosphereHeightM, semiMajorAxisM,
  eccentricity, inclinationDeg, longitudeOfAscendingNodeDeg, configPath, override,
]) => ({
  bodyId, parentBodyId, radiusM, gravitationalParameter, atmosphereHeightM, semiMajorAxisM,
  eccentricity, inclinationDeg, longitudeOfAscendingNodeDeg, configPath,
  sphereOfInfluenceM: override ?? Math.max(
    semiMajorAxisM * (gravitationalParameter / parentMu.get(parentBodyId)!) ** (2 / 5),
    2 * radiusM, radiusM + 40000,
  ),
}))
