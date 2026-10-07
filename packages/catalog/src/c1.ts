import { each, loop, optional, pick, replicate, seq, withHash, type Recipe } from '@byway/recipe';
import {
  applyDirective,
  asset,
  critic,
  criticFix,
  criticGate,
  cutByHuman,
  defectCheck,
  render,
  seedBuild,
  tellsCompareByHuman,
  tellsSweep,
  voiceByHuman,
} from './steps.ts';

/**
 * C1 Studio, the article's configuration (03-configurations, C1), seed entry route.
 * Not yet modelled in Milestone 0: the vision and C2 entry routes, the optional early pick and RELAY.
 */
export const c1: Recipe = withHash({
  schema: 'byway.recipe/1',
  id: 'c1',
  title: 'C1 Studio (seed entry; vision routes and RELAY not yet modelled)',
  kind: 'protocol-config',
  family: 'C1',
  channel: 'protocol',
  inputs: ['intent', 'tells'],
  stages: [
    { stage: 'D1', body: replicate('seeded-x4', 4, seedBuild('seed-build', ['intent'], true)) },
    {
      stage: 'D2',
      body: seq(
        each(
          'each-candidate',
          seq(
            loop('critic-loop', seq(render('render'), critic('critic'), criticFix('critic-fix')), criticGate('human')),
            optional('asset-if-plain', 'a human calls the design plain', seq(asset('asset'), render('asset-verify'))),
          ),
        ),
        pick('pick-one', 'H', 1, 'human'),
      ),
    },
    {
      stage: 'D3',
      body: seq(
        render('cut-render'),
        cutByHuman('cut'),
        applyDirective('apply-cut', 'project.apply-cut'),
        render('tells-render'),
        tellsSweep('tells-sweep'),
        applyDirective('apply-swaps', 'project.apply-swaps'),
        render('compare-render'),
        tellsCompareByHuman('tells-compare'),
        voiceByHuman('voice'),
        render('final-render'),
        defectCheck('critic-check'),
      ),
    },
  ],
  sitsOut: [],
  exceptions: ['C1-DR2', 'C1-DR7'],
  bank: true,
});
