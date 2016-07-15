const random  = require('../utils').random;
const range   = require('../utils').range;
const logger  = require('../utils').logger;
const andify  = require('../utils').andify;
const db      = require('./db').connection;
const moment  = require('moment');
const async   = require('async');
const _       = require('lodash');
const Promise = require('bluebird');

module.exports = {
  add(data) {
    return new Promise((resolve, reject) => {
      let tags = data.tags;
      delete data.tags;
      data.ref = this.genRandomRef();
      data.description = "";

      db.query('INSERT INTO `snippet` SET ?', data, (err, result) => {
        if (err) reject(err);
        else {
          this.addTags(tags, result.insertId).then(() => {
            resolve({['s.id']: result.insertId});
          });
        }
      });
    });
  },
  remove(cond) {
    return new Promise((resolve, reject) => {
      db.query('DELETE FROM `snippettags` WHERE ?', {snippetID: cond.id}, () => {
        db.query('DELETE FROM `snippet` WHERE ?', cond, (err, data) => {
          err ? reject(err) : resolve();
        });
      });
    });
  },
  genRandomRef() {
    let ref, dup;
    do {
      dup = false;
      ref = random(5, 8);

      this.refExists(ref).then(exists => {
        dup = exists;
      }, () => {});
    } while(dup);
    return ref;
  },
  refExists(ref) {
    return new Promise((resolve, reject) => {
      db.query('SELECT * FROM `snippet` WHERE ?', {ref}, (err, data) => {
        if (err) reject(err);
        else resolve(data.length !== 0);
      });
    });
  },
  getCond(cond) {
    return new Promise((resolve, reject) => {
      cond = andify(cond);
      if (cond.query !== undefined) {
        db.query('SELECT s.* FROM `snippet` s \
        INNER JOIN `user` u ON (u.id=s.owner) WHERE ' + cond.query, (err, data) => {
          if (err) reject(err);
          else if (data.length === 0) resolve(null);
          else if (data.length === 1) resolve(data[0]);
          else resolve(data);
        });
      } else {
        db.query('SELECT s.* FROM `snippet` s \
        INNER JOIN `user` u ON (u.id=s.owner) WHERE ?', cond, (err, data) => {
          if (err) reject(err);
          else if (data.length === 0) resolve(null);
          else if (data.length === 1) resolve(data[0]);
          else resolve(data);
        });
      }
    });
  },
  getTags(id) {
    let tags = []
    return new Promise((resolve, reject) => {
      db.query(`SELECT s.*, t.name FROM snippettags s INNER JOIN tags t ON (s.tagID=t.id) WHERE s.snippetID = ${db.escape(id)}`, (err, data) => {
        data.forEach(tag => tags.push(tag.name));
        resolve(tags);
      });
    });
  },
  updateTags(tags, id) {
    let self = this;
    return new Promise((resolve, reject) => {
      self.getTags(id).then(oldTags => {
        let remove = _.difference(oldTags, tags);
        let add = _.difference(tags, oldTags);

        this.removeTags(remove, id)
        .then(this.addTags(add, id))
        .then(resolve);
      });
    });
  },
  addTags(tags, id) {
    return new Promise((resolve, reject) => {
      async.series([

        // Add tags to tags table
        cb => {
          async.each(tags, (tag, finished) => {
            db.query(`INSERT IGNORE INTO tags (name) VALUES (${db.escape(tag)});`, () => finished());
          }, cb);
        },
        // And then link Snippet id to tags
        cb => {
          async.each(tags, (tag, finished) => {
            db.query(`INSERT INTO snippettags(snippetID, tagID) VALUES (${id}, \
            (SELECT id FROM tags WHERE name=${db.escape(tag)}))`, () => finished());
          }, cb);
        }
      ], resolve);
    });
  },
  removeTags(tags, id) {
    return new Promise((resolve, reject) => {
      // Remove link between Snippets and tags
      async.each(tags, (tag, finished) => {
        db.query(`DELETE FROM snippettags WHERE snippetID = ${id} AND \
        tagID = (SELECT id FROM tags WHERE name=${db.escape(tag)})`, () => finished());
      }, resolve);
    });
  },
  getSnippets(owner) {
    return new Promise((resolve, reject) => {
      db.query('SELECT * FROM `snippet` WHERE ? ORDER BY `modified` DESC', {owner}, (err, data) => {
        if (err) reject(err);
        else if (data.length === 0) resolve(null);
        else resolve(data);
      });
    });
  },
  update(vals, ref) {
    return new Promise((resolve, reject) => {
      db.query('UPDATE `snippet` SET ? WHERE ?', [vals, {ref}], (err, result) => {
        this.modified(ref).then(() => {
          resolve({err: err, result: result});
        });
      });
    });
  },
  modified(ref) {
    return new Promise((resolve, reject) => {
      db.query('UPDATE `snippet` SET ? WHERE ?', [{modified: moment(new Date().getTime()).format("YYYY-MM-DD HH:mm:ss")}, {ref}], (err, result) => {
        resolve({err: err, result: result});
      });
    });
  }
};
