export default {
  apiVersion: 1,
  id: 'example.suspicious-filename',
  name: 'Suspicious filename example',
  inspect(_buffer, context) {
    if (!/(password|secret|private)/i.test(context.name ?? '')) return [];
    return [{
      severity: 'medium',
      category: 'sensitive-name',
      title: 'Filename may reveal sensitive intent',
      message: 'The filename contains a word commonly associated with private material.',
      evidence: context.name,
      confidence: 0.7,
      tags: ['example']
    }];
  }
};
